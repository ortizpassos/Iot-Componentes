import { PackagingService } from '../packaging/packaging.module';
import * as bcrypt from 'bcrypt';
import { RegisterDto } from '../auth/dto/register.dto';
import { BadRequestException, ConflictException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Product } from '../products/schemas/product.schema';
import { CreateProductDto } from '../products/dto/create-product.dto';
import { Order, OrderStatus } from '../orders/schemas/order.schema';
import { User, UserRole } from '../users/schemas/user.schema';
import { Device } from '../devices/schemas/device.schema';
import { Project } from '../projects/schemas/project.schema';
import { AdminDeviceDto, AdminListDto, AdminProjectDto, OrderOfferDto, UpdateAdminDto } from './admin.dto';
import { shippingLabel } from './shipping-label';
import { SettingsService } from '../settings/settings.module';
import { ProductSkuService } from '../products/product-sku.service';
import { EmailEventsService } from '../email/email-events.module';
import { NotificationsService } from '../notifications/notifications.module';

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
    private readonly packaging: PackagingService,
    @Optional() private readonly emails?: EmailEventsService,
    @Optional() private readonly notifications?: NotificationsService,
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
      this.products.countDocuments({ storeProjectId: { $exists: false } }), this.products.countDocuments({ active: true, storeProjectId: { $exists: false } }),
      this.orders.countDocuments(), this.orders.countDocuments({ status: OrderStatus.PENDING }),
      this.users.countDocuments({ role: UserRole.CUSTOMER }), this.users.countDocuments({ role: UserRole.ADMIN }), this.devices.countDocuments(), this.products.countDocuments({ storeProjectId: { $exists: true }, deliveryKind: 'DIGITAL' }),
    ]);
    return { products, activeProducts, orders, pendingOrders, customers, admins, devices, projects };
  }
  listProducts(query: AdminListDto) { return this.list(this.products, query, ['name', 'sku', 'model'], undefined, { storeProjectId: { $exists: false } }); }
  async createProduct(dto: CreateProductDto) {
    if (dto.packagingId) dto = { ...dto, ...await this.packaging.dimensions(dto.packagingId) };
    const data = dto.sku ? dto : { ...dto, sku: await this.productSkuService.next(dto.type) };
    return this.write(() => this.products.create(data));
  }
  async deleteProduct(id: string) {
    const result = await this.products.deleteOne({ _id: this.id(id) });
    if (!result.deletedCount) throw new NotFoundException('Produto não encontrado.');
    return { deleted: true };
  }
  async updateProduct(id: string, dto: CreateProductDto) {
    if (dto.packagingId) dto = { ...dto, ...await this.packaging.dimensions(dto.packagingId) };
    return this.update(this.products, id, dto);
  }
  productActive(id: string, active: boolean) { return this.update(this.products, id, { active }); }
  listOrders(query: AdminListDto) { return this.list(this.orders, query, ['status', 'items.name', 'items.sku'], 'customer', { status: { $in: [OrderStatus.PAID, OrderStatus.LABEL_ISSUED, OrderStatus.SHIPPED, OrderStatus.FULFILLED] } }); }
  listUnpaidOrders(query: AdminListDto) { return this.list(this.orders, query, ['items.name', 'items.sku'], 'customer', { status: OrderStatus.PENDING }); }
  async sendOffer(id: string, dto: OrderOfferDto) {
    const order = await this.order(id);
    return this.sendOfferToOrder(order, dto);
  }
  async sendOfferToAll(dto: OrderOfferDto) {
    const orders = await this.orders.find({ status: OrderStatus.PENDING }).populate('customer', 'name email').lean();
    let sent = 0;
    for (const order of orders) {
      try { await this.sendOfferToOrder(order, dto); sent++; } catch (error) { if (!(error instanceof ConflictException)) throw error; }
    }
    return { sent, total: orders.length };
  }
  private async sendOfferToOrder(order: any, dto: OrderOfferDto) {
    if (order.status !== OrderStatus.PENDING) throw new ConflictException('A oferta só pode ser enviada para compras não finalizadas.');
    if (order.reservationExpiresAt && order.reservationExpiresAt <= new Date()) throw new ConflictException('A reserva deste pedido expirou.');
    const customer = order.customer as any;
    const gift = dto.gift?.trim();
    if (!dto.discountPercent && !dto.freeShipping && !gift) throw new BadRequestException('Informe um desconto, frete grátis ou brinde.');
    const sentAt = new Date();
    const offer = { discountPercent: dto.discountPercent || 0, freeShipping: dto.freeShipping === true, ...(gift ? { gift } : {}), sentAt, expiresAt: new Date(sentAt.getTime() + 24 * 60 * 60_000) };
    const result = await this.orders.findOneAndUpdate({ _id: order._id, status: OrderStatus.PENDING }, { $set: { offer } }, { new: true, runValidators: true }).populate('customer', 'name email').lean();
    if (!result) throw new ConflictException('Pedido alterado. Atualize a lista.');
    if (this.emails && customer?.email) void this.emails.publish({ type: 'order.offer', email: customer.email, name: customer.name || 'Cliente', orderId: String(order._id), total: order.total, discountPercent: offer.discountPercent, freeShipping: offer.freeShipping, gift: offer.gift });
    if (this.notifications && customer?._id) void this.notifications.create(String(customer._id), { type: 'OFFER', title: 'Oferta especial disponível', message: `Você recebeu uma condição especial para o pedido #${String(order._id).slice(-8)}. Abra o pedido para conferir.`, link: `/pedidos/${order._id}` });
    return { sent: true, offer: result.offer };
  }
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
    if (status === OrderStatus.PAID) this.notifyOrder(result, 'order.paid');
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
    this.notifyOrder(result, 'order.shipped');
    return result;
  }
  private notifyOrder(order: any, type: 'order.paid' | 'order.shipped') {
    const customer = order.customer;
    if (!customer?.email) return;
    if (this.emails) {
      if (type === 'order.paid') void this.emails.publish({ type, email: customer.email, name: customer.name || 'Cliente', orderId: String(order._id), total: order.total });
      else void this.emails.publish({ type, email: customer.email, name: customer.name || 'Cliente', orderId: String(order._id), trackingCode: order.trackingCode });
    }
    if (this.notifications && customer?._id) void this.notifications.create(String(customer._id), { type: 'ORDER', title: type === 'order.paid' ? 'Pagamento confirmado' : 'Pedido enviado', message: type === 'order.paid' ? `O pagamento do pedido #${String(order._id).slice(-8)} foi confirmado.` : `O pedido #${String(order._id).slice(-8)} foi enviado.`, link: `/pedidos/${order._id}` });
  }
  async issueLabel(id: string) {
    const order = await this.order(id);
    if (order.requiresShipping === false) throw new ConflictException('Projeto digital não possui etiqueta de envio.');
    if (order.status !== OrderStatus.PAID) throw new ConflictException('Somente pedidos pagos podem solicitar impressao.');
    const sender = await this.settings.getShippingSender();
    // Validate label data before enqueueing. Only the monitor acknowledges issuance.
    await shippingLabel(id, order.checkoutProfile, sender, order.items.filter(item => item.deliveryKind !== 'DIGITAL'));
    const result = await this.orders.updateOne({ _id: this.id(id), status: OrderStatus.PAID, printJob: { $exists: false } }, { $set: { labelRequestedAt: new Date(), shippingSender: sender } });
    if (!result.matchedCount) throw new ConflictException('Pedido alterado ou com tentativa de impressao registrada. Atualize a lista e revise a tentativa existente.');
    return { queued: true };
  }
  async label(id: string) {
    const order = await this.order(id);
    if (![OrderStatus.LABEL_ISSUED, OrderStatus.SHIPPED].includes(order.status)) throw new ConflictException('Emita a etiqueta primeiro.');
    return shippingLabel(id, order.checkoutProfile, order.shippingSender || await this.settings.getShippingSender(), order.items.filter(item => item.deliveryKind !== 'DIGITAL'));
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
  async updateAdmin(id: string, dto: UpdateAdminDto) {
    const fields: { name?: string; email?: string; password?: string } = {};
    if (dto.name !== undefined) fields.name = dto.name.trim();
    if (dto.email !== undefined) fields.email = dto.email.trim().toLowerCase();
    if (dto.password) fields.password = await bcrypt.hash(dto.password, 12);
    if (!Object.keys(fields).length) throw new BadRequestException('Informe ao menos um campo para alterar.');
    const result = await this.users.findOneAndUpdate({ _id: this.id(id), role: UserRole.ADMIN }, { $set: fields }, { new: true, runValidators: true }).select('-password').lean();
    if (!result) throw new NotFoundException('Administrador não encontrado.');
    return result;
  }
  async deleteAdmin(id: string, currentUserId: string) {
    if (id === currentUserId) throw new ConflictException('Não é possível excluir o próprio administrador.');
    const result = await this.users.deleteOne({ _id: this.id(id), role: UserRole.ADMIN });
    if (!result.deletedCount) throw new NotFoundException('Administrador não encontrado.');
    return { deleted: true };
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
