import * as bcrypt from 'bcrypt';
import { RegisterDto } from '../auth/dto/register.dto';
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
import { ProductSkuService } from '../products/product-sku.service';

@Injectable()
export class AdminService {
  constructor(
    @InjectModel(Product.name) private readonly products: Model<Product>,
    @InjectModel(Order.name) private readonly orders: Model<Order>,
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectModel(Device.name) private readonly devices: Model<Device>,
    @InjectModel(Project.name) private readonly projects: Model<Project>,
    private readonly settings: SettingsService,
    private readonly productSkuService: ProductSkuService,
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
  private async list<T>(model: Model<T>, query: AdminListDto, fields: string[], populate?: string, scope: object = {}) {
    const text = query.search?.trim();
    const escaped = text?.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const filter: any = escaped ? { $or: fields.map(field => ({ [field]: { $regex: escaped, $options: 'i' } })) } : {};
    if (text && Types.ObjectId.isValid(text)) filter.$or.push({ _id: new Types.ObjectId(text) });
    Object.assign(filter, scope);
    const request = model.find(filter).select(model === (this.orders as unknown) ? '-password +printJob' : '-password').sort({ createdAt: -1 }).skip((query.page - 1) * query.limit).limit(query.limit);
    if (populate) request.populate(populate, 'name email');
    const [items, total] = await Promise.all([request.lean(), model.countDocuments(filter)]);
    const safeItems = items.map((item: any) => { const { printJob, ...safe } = item; return printJob ? { ...safe, printState: printJob.state, printError: printJob.error } : safe; });
    return { items: safeItems, total, page: query.page, limit: query.limit };
  }
  async summary() {
    const [products, activeProducts, orders, pendingOrders, customers, admins, devices, projects] = await Promise.all([
      this.products.countDocuments(), this.products.countDocuments({ active: true }),
      this.orders.countDocuments(), this.orders.countDocuments({ status: OrderStatus.PENDING }),
      this.users.countDocuments({ role: UserRole.CUSTOMER }), this.users.countDocuments({ role: UserRole.ADMIN }), this.devices.countDocuments(), this.projects.countDocuments(),
    ]);
    return { products, activeProducts, orders, pendingOrders, customers, admins, devices, projects };
  }
  listProducts(query: AdminListDto) { return this.list(this.products, query, ['name', 'sku', 'model']); }
  async createProduct(dto: CreateProductDto) {
    const data = dto.sku ? dto : { ...dto, sku: await this.productSkuService.next(dto.type) };
    return this.write(() => this.products.create(data));
  }
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
      PENDING: [OrderStatus.PAID, OrderStatus.CANCELLED], PAID: [OrderStatus.CANCELLED], LABEL_ISSUED: [OrderStatus.CANCELLED],
      CANCELLED: [], FULFILLED: [], SHIPPED: [],
    };
    const order = await this.order(id);
    if (order.status === status) return order;
    if (!allowed[order.status].includes(status)) throw new ConflictException('Transição de status não permitida.');
    const result = await this.orders.findOneAndUpdate({ _id: this.id(id), status: order.status, ...(status === OrderStatus.PAID ? {} : { payment: { $exists: false } }) }, { $set: { status, ...(status === OrderStatus.PAID ? { manuallyPaidAt: new Date() } : {}) } }, { new: true, runValidators: true }).populate('customer', 'name email').lean();
    if (!result) throw new ConflictException('Pedido alterado ou com pagamento online. Pagamentos e estornos devem ser confirmados pelo Mercado Pago.');
    return result;
  }
  async retryPrint(id: string) {
    const result = await this.orders.updateOne({ _id: this.id(id), status: OrderStatus.PAID, 'printJob.state': { $in: ['CLAIMED', 'PRINTING', 'ERROR'] } }, { $unset: { printJob: 1 } });
    if (!result.modifiedCount) throw new ConflictException('Pedido indisponivel para nova tentativa.');
    return { queued: true };
  }
  async shipOrder(id: string, trackingCode: string) {
    const order = await this.order(id);
    if (order.status === OrderStatus.SHIPPED && order.trackingCode === trackingCode) return order;
    if (order.status !== OrderStatus.LABEL_ISSUED) throw new ConflictException('Emita a etiqueta antes de confirmar o envio.');
    const result = await this.orders.findOneAndUpdate({ _id: this.id(id), status: OrderStatus.LABEL_ISSUED }, { $set: { status: OrderStatus.SHIPPED, shippedAt: new Date(), trackingCode } }, { new: true }).populate('customer', 'name email').lean();
    if (!result) throw new ConflictException('Pedido alterado. Atualize a lista.');
    return result;
  }
  async issueLabel(id: string) {
    const order = await this.order(id);
    if (order.status !== OrderStatus.PAID) throw new ConflictException('Somente pedidos pagos podem solicitar impressao.');
    const sender = await this.settings.getShippingSender();
    // Validate label data before enqueueing. Only the monitor acknowledges issuance.
    await shippingLabel(id, order.checkoutProfile, sender, order.items);
    const result = await this.orders.updateOne({ _id: this.id(id), status: OrderStatus.PAID, printJob: { $exists: false } }, { $set: { labelRequestedAt: new Date(), shippingSender: sender } });
    if (!result.matchedCount) throw new ConflictException('Pedido alterado ou com tentativa de impressao registrada. Atualize a lista e revise a tentativa existente.');
    return { queued: true };
  }
  async label(id: string) {
    const order = await this.order(id);
    if (![OrderStatus.LABEL_ISSUED, OrderStatus.SHIPPED].includes(order.status)) throw new ConflictException('Emita a etiqueta primeiro.');
    return shippingLabel(id, order.checkoutProfile, order.shippingSender || await this.settings.getShippingSender(), order.items);
  }
  async createAdmin(dto: RegisterDto) {
    if (dto.name.trim().length < 2 || Buffer.byteLength(dto.password, 'utf8') > 72) throw new BadRequestException('Nome ou senha inválidos. A senha deve ter no máximo 72 bytes.');
    try {
      const user = await this.users.create({ name: dto.name.trim(), email: dto.email.trim().toLowerCase(), password: await bcrypt.hash(dto.password, 12), role: UserRole.ADMIN, active: true });
      return { _id: user._id, name: user.name, email: user.email, role: user.role, active: user.active };
    } catch (error) {
      if ((error as { code?: number }).code === 11000) throw new ConflictException('E-mail já cadastrado.');
      throw error;
    }
  }
  listUsers(query: AdminListDto) { return this.list(this.users, query, ['name', 'email'], undefined, { role: UserRole.CUSTOMER }); }
  listAdmins(query: AdminListDto) { return this.list(this.users, query, ['name', 'email'], undefined, { role: UserRole.ADMIN }); }
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
