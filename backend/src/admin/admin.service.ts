import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Product } from '../products/schemas/product.schema';
import { CreateProductDto } from '../products/dto/create-product.dto';
import { Order, OrderStatus } from '../orders/schemas/order.schema';
import { User, UserRole } from '../users/schemas/user.schema';
import { Device } from '../devices/schemas/device.schema';
import { Project } from '../projects/schemas/project.schema';
import { AdminDeviceDto, AdminListDto, AdminProjectDto } from './admin.dto';
import { shippingLabel } from './shipping-label';
import { SettingsService } from '../settings/settings.module';

@Injectable()
export class AdminService {
  constructor(
    @InjectModel(Product.name) private readonly products: Model<Product>,
    @InjectModel(Order.name) private readonly orders: Model<Order>,
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectModel(Device.name) private readonly devices: Model<Device>,
    @InjectModel(Project.name) private readonly projects: Model<Project>,
    private readonly settings: SettingsService,
  ) {}

  private id(id: string) {
    if (!Types.ObjectId.isValid(id)) throw new BadRequestException('ID inválido.');
    return new Types.ObjectId(id);
  }
  private async write<T>(operation: () => Promise<T>): Promise<T> {
    try { return await operation(); } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 11000) throw new ConflictException('SKU ou número de série já cadastrado.');
      throw error;
    }
  }
  private async update<T>(model: Model<T>, id: string, data: object) {
    return this.write(async () => {
      const result = await model.findByIdAndUpdate(this.id(id), { $set: data }, { new: true, runValidators: true }).lean();
      if (!result) throw new NotFoundException('Registro não encontrado.');
      return result;
    });
  }
  private async list<T>(model: Model<T>, query: AdminListDto, fields: string[], populate?: string) {
    const text = query.search?.trim();
    const escaped = text?.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const filter: any = escaped ? { $or: fields.map(field => ({ [field]: { $regex: escaped, $options: 'i' } })) } : {};
    if (text && Types.ObjectId.isValid(text)) filter.$or.push({ _id: new Types.ObjectId(text) });
    const request = model.find(filter).select('-password').sort({ createdAt: -1 }).skip((query.page - 1) * query.limit).limit(query.limit);
    if (populate) request.populate(populate, 'name email');
    const [items, total] = await Promise.all([request.lean(), model.countDocuments(filter)]);
    return { items, total, page: query.page, limit: query.limit };
  }
  async summary() {
    const [products, activeProducts, orders, pendingOrders, customers, devices, projects] = await Promise.all([
      this.products.countDocuments(), this.products.countDocuments({ active: true }),
      this.orders.countDocuments(), this.orders.countDocuments({ status: OrderStatus.PENDING }),
      this.users.countDocuments(), this.devices.countDocuments(), this.projects.countDocuments(),
    ]);
    return { products, activeProducts, orders, pendingOrders, customers, devices, projects };
  }
  listProducts(query: AdminListDto) { return this.list(this.products, query, ['name', 'sku', 'model']); }
  createProduct(dto: CreateProductDto) { return this.write(() => this.products.create(dto)); }
  async deleteProduct(id: string) {
    const result = await this.products.deleteOne({ _id: this.id(id) });
    if (!result.deletedCount) throw new NotFoundException('Produto não encontrado.');
    return { deleted: true };
  }
  updateProduct(id: string, dto: CreateProductDto) { return this.update(this.products, id, dto); }
  productActive(id: string, active: boolean) { return this.update(this.products, id, { active }); }
  listOrders(query: AdminListDto) { return this.list(this.orders, query, ['status', 'items.name', 'items.sku'], 'customer'); }
  async order(id: string) {
    const result = await this.orders.findById(this.id(id)).populate('customer', 'name email').lean();
    if (!result) throw new NotFoundException('Pedido não encontrado.');
    return result;
  }
  async orderStatus(id: string, status: OrderStatus) {
    if ([OrderStatus.SHIPPED, OrderStatus.FULFILLED].includes(status)) throw new ConflictException('Use a ação de envio com geração da etiqueta.');
    const allowed: Record<OrderStatus, OrderStatus[]> = {
      PENDING: [OrderStatus.PAID, OrderStatus.CANCELLED], PAID: [OrderStatus.CANCELLED],
      CANCELLED: [], FULFILLED: [], SHIPPED: [],
    };
    const order = await this.order(id);
    if (order.status === status) return order;
    if (!allowed[order.status].includes(status)) throw new ConflictException('Transição de status não permitida.');
    const result = await this.orders.findOneAndUpdate({ _id: this.id(id), status: order.status, payment: { $exists: false } }, { $set: { status } }, { new: true, runValidators: true }).populate('customer', 'name email').lean();
    if (!result) throw new ConflictException('Pedido alterado ou com pagamento online. Pagamentos e estornos devem ser confirmados pelo Mercado Pago.');
    return result;
  }
  async shipOrder(id: string) {
    const order = await this.order(id);
    if (order.status === OrderStatus.SHIPPED) return this.label(id);
    if (order.status !== OrderStatus.PAID) throw new ConflictException('Somente pedidos pagos podem ser enviados.');
    // Generate successfully before changing status; retries can download again without another transition.
    const sender = await this.settings.getShippingSender();
    const pdf = await shippingLabel(id, order.checkoutProfile, sender);
    const updated = await this.orders.updateOne({ _id: this.id(id), status: OrderStatus.PAID }, { $set: { status: OrderStatus.SHIPPED, shippedAt: new Date(), shippingSender: sender } });
    if (!updated.modifiedCount) {
      const current = await this.order(id);
      if (current.status !== OrderStatus.SHIPPED) throw new ConflictException('O pedido foi alterado. Atualize a lista antes de enviar.');
      return this.label(id);
    }
    return pdf;
  }
  async label(id: string) {
    const order = await this.order(id);
    if (order.status !== OrderStatus.SHIPPED) throw new ConflictException('A etiqueta está disponível após confirmar o envio.');
    return shippingLabel(id, order.checkoutProfile, order.shippingSender || await this.settings.getShippingSender());
  }
  listUsers(query: AdminListDto) { return this.list(this.users, query, ['name', 'email', 'role']); }
  async userActive(id: string, active: boolean) {
    // Admin grants/revocations are deliberately restricted to the local operator command.
    const user = await this.users.findOneAndUpdate({ _id: this.id(id), role: { $ne: UserRole.ADMIN } }, { $set: { active } }, { new: true }).select('-password').lean();
    if (!user) throw new ConflictException('Conta inexistente ou administrativa. Administradores são gerenciados pelo operador do servidor.');
    return user;
  }
  listDevices(query: AdminListDto) { return this.list(this.devices, query, ['name', 'board', 'model', 'serialNumber'], 'owner'); }
  listProjects(query: AdminListDto) { return this.list(this.projects, query, ['name', 'description', 'status'], 'owner'); }
  private async owner(id: string) {
    if (!await this.users.exists({ _id: this.id(id), active: true })) throw new BadRequestException('Selecione um cliente ativo.');
  }
  async saveDevice(dto: AdminDeviceDto, id?: string) {
    await this.owner(dto.ownerId);
    const { ownerId, ...fields } = dto;
    if (!fields.name.trim() || !fields.board.trim()) throw new BadRequestException('Nome e placa são obrigatórios.');
    if (id) {
      const current = await this.devices.findById(this.id(id));
      if (!current) throw new NotFoundException('Dispositivo não encontrado.');
      if (String(current.owner) !== ownerId) throw new BadRequestException('O proprietário de um dispositivo existente não pode ser alterado.');
    }
    const data = { ...fields, owner: this.id(ownerId) };
    return id ? this.update(this.devices, id, data) : this.write(() => this.devices.create(data));
  }
  async saveProject(dto: AdminProjectDto, id?: string) {
    await this.owner(dto.ownerId);
    const { ownerId, deviceId, ...fields } = dto;
    if (!fields.name.trim()) throw new BadRequestException('Nome é obrigatório.');
    if (deviceId && !await this.devices.exists({ _id: this.id(deviceId), owner: this.id(ownerId) })) throw new BadRequestException('O dispositivo deve pertencer ao cliente selecionado.');
    if (id) {
      const current = await this.projects.findById(this.id(id));
      if (!current) throw new NotFoundException('Projeto não encontrado.');
      if (String(current.owner) !== ownerId) throw new BadRequestException('O proprietário de um projeto existente não pode ser alterado.');
    }
    const data = { ...fields, owner: this.id(ownerId), device: deviceId ? this.id(deviceId) : null };
    return id ? this.update(this.projects, id, data) : this.write(() => this.projects.create(data));
  }
}
