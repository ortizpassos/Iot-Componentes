import { BadRequestException, ConflictException, Injectable, NotFoundException, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ProductsService } from '../products/products.service';
import { InstallmentFeePayer } from '../products/schemas/product.schema';
import { UsersService } from '../users/users.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { Order, OrderDocument, OrderItem, OrderStatus, ProgrammingType } from './schemas/order.schema';
import { ShippingService } from '../shipping/shipping.module';
import { SettingsService } from '../settings/settings.module';

@Injectable()
export class OrdersService implements OnModuleInit, OnModuleDestroy {
  private reservationTimer?: NodeJS.Timeout;

  constructor(
    @InjectModel(Order.name) private readonly orderModel: Model<OrderDocument>,
    private readonly productsService: ProductsService,
    private readonly usersService: UsersService,
    private readonly shippingService: ShippingService,
    @Optional() private readonly settingsService?: SettingsService,
  ) {}

  onModuleInit() {
    this.reservationTimer = setInterval(() => void this.releaseExpiredReservations(), 60_000);
    this.reservationTimer.unref();
  }

  onModuleDestroy() {
    if (this.reservationTimer) clearInterval(this.reservationTimer);
  }

  async create(customerId: string, dto: CreateOrderDto) {
    const checkoutProfile = await this.usersService.requireCheckoutProfile(customerId);
    const ids = dto.items.map(item => item.productId.toLowerCase());
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException('Informe cada produto uma única vez no pedido.');
    }

    const items: OrderItem[] = [];
    let totalCents = 0;
    for (const input of dto.items) {
      const product = await this.productsService.findById(input.productId);
      if (!product.active) throw new BadRequestException('Produto inativo.');
      if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > product.stock || !Number.isInteger(product.stock)) {
        throw new BadRequestException(`Estoque insuficiente para ${product.name}. Disponível: ${product.stock || 0} unidade(s).`);
      }
      const request = input.programmingRequest;
      const requested = request?.requested ?? false;
      const type = request?.type ?? ProgrammingType.NONE;
      const requirements = request?.requirements?.trim();
      if (requested !== (type !== ProgrammingType.NONE) || (!requested && requirements)) {
        throw new BadRequestException('Solicitação de programação inconsistente.');
      }
      if (requested && !product.programming?.supported) {
        throw new BadRequestException('Produto não suporta programação.');
      }
      if ((type === ProgrammingType.AI || type === ProgrammingType.CUSTOM) && !requirements) {
        throw new BadRequestException('Descreva os requisitos da programação solicitada.');
      }

      // Compute using integer cents; never accept prices or totals from the client.
      const unitCents = Math.round((product.price + Number.EPSILON) * 100);
      const itemCents = unitCents * input.quantity;
      totalCents += itemCents;
      if (unitCents < 0 || !Number.isSafeInteger(unitCents) || !Number.isSafeInteger(itemCents) || !Number.isSafeInteger(totalCents)) {
        throw new BadRequestException('Valor do pedido fora do limite suportado.');
      }
      items.push({
        productId: new Types.ObjectId(input.productId),
        ...(product.storeProjectId ? { storeProjectId: product.storeProjectId, deliveryKind: product.deliveryKind } : {}),
        sku: product.sku,
        name: product.name,
        installmentFeePayer: product.installmentFeePayer || InstallmentFeePayer.BUYER,
        quantity: input.quantity,
        unitPrice: unitCents / 100,
        total: itemCents / 100,
        ...(() => {
          const productOffer = product.offer;
          const active = !!productOffer?.enabled && (!productOffer.expiresAt || new Date(productOffer.expiresAt).getTime() > Date.now());
          return active && (productOffer.discountPercent || productOffer.freeShipping) ? { offer: { discountPercent: productOffer.discountPercent || 0, freeShipping: productOffer.freeShipping === true } } : {};
        })(),
        programmingRequest: { requested, type, ...(requirements ? { requirements } : {}) },
      });
    }

    let shipping: { serviceId: string; name: string; price: number; deliveryDays: number | null } | undefined;
    const physicalItems = items.filter(item => item.deliveryKind !== 'DIGITAL');
    if (physicalItems.some(item => item.storeProjectId) && !dto.shippingServiceId) throw new BadRequestException('Selecione o frete para o dispositivo completo.');
    if (dto.shippingServiceId && physicalItems.length) {
      const quote = await this.shippingService.quote({
        destinationZipCode: checkoutProfile.address.zipCode,
        items: physicalItems.map(item => ({ productId: String(item.productId), quantity: item.quantity })),
      });
      const selected = quote.services.find(service => service.code === dto.shippingServiceId);
      if (!selected) throw new BadRequestException('A modalidade de frete selecionada não está disponível. Calcule novamente.');
      shipping = { serviceId: selected.code, name: selected.name, price: selected.price, deliveryDays: selected.deliveryDays };
      const shippingCents = Math.round((selected.price + Number.EPSILON) * 100);
      totalCents += shippingCents;
      if (!Number.isSafeInteger(shippingCents) || !Number.isSafeInteger(totalCents)) throw new BadRequestException('Valor do frete fora do limite suportado.');
    }

    const global = this.settingsService ? (await this.settingsService.get()).globalOffer : undefined;
    const globalActive = !!global?.enabled && (!global.expiresAt || new Date(global.expiresAt).getTime() > Date.now());
    const freeShippingMinimum = Number(global?.freeShippingMinimum) > 0 ? Number(global?.freeShippingMinimum) : undefined;
    const freeShippingQualified = global?.freeShipping === true && (!freeShippingMinimum || totalCents / 100 >= freeShippingMinimum);
    const discountPercent = global?.discountEnabled === false ? 0 : global?.discountPercent || 0;
    const offer = globalActive ? { discountPercent, freeShipping: freeShippingQualified, ...(freeShippingMinimum ? { freeShippingMinimum } : {}), ...(global.gift ? { gift: global.gift } : {}), sentAt: new Date(), viewedAt: new Date(), expiresAt: global.expiresAt ? new Date(global.expiresAt) : new Date(Date.now() + 24 * 60 * 60_000) } : undefined;
    const reserved: { productId: string; quantity: number }[] = [];
    try {
      for (const item of items) {
        const product = await this.productsService.reserveStock(String(item.productId), item.quantity);
        if (!product) throw new ConflictException(`A unidade de ${item.name} acabou de ser reservada por outro cliente.`);
        reserved.push({ productId: String(item.productId), quantity: item.quantity });
      }
      return await this.orderModel.create({
        customer: new Types.ObjectId(customerId),
        checkoutProfile,
        requiresShipping: physicalItems.length > 0,
        status: OrderStatus.PENDING,
        reservationExpiresAt: new Date(Date.now() + 5 * 60 * 1000),
        items,
        ...(shipping ? { shipping } : {}),
        ...(offer ? { offer } : {}),
        total: totalCents / 100,
      });
    } catch (error) {
      if (reserved.length) await this.productsService.releaseStock(reserved);
      throw error;
    }
  }

  async releaseExpiredReservations() {
    const expired = await this.orderModel.find({
      status: OrderStatus.PENDING,
      reservationExpiresAt: { $lte: new Date() },
      stockReleasedAt: { $exists: false },
    }).select('_id items').lean();
    for (const order of expired) {
      const result = await this.orderModel.updateOne(
        { _id: order._id, status: OrderStatus.PENDING, stockReleasedAt: { $exists: false } },
        { $set: { status: OrderStatus.CANCELLED, stockReleasedAt: new Date() } },
      );
      if (result.modifiedCount) await this.productsService.releaseStock(order.items.map(item => ({ productId: String(item.productId), quantity: item.quantity })));
    }
  }

  findAll(customerId: string) {
    return this.orderModel.find({ customer: customerId }).sort({ createdAt: -1 }).lean();
  }

  async findOne(customerId: string, id: string) {
    if (!Types.ObjectId.isValid(id)) throw new BadRequestException('ID de pedido inválido.');
    const now = new Date();
    const offerExpiresAt = new Date(now.getTime() + 24 * 60 * 60_000);
    const viewed = await this.orderModel.findOneAndUpdate(
      { _id: id, customer: customerId, status: OrderStatus.PENDING, 'offer.expiresAt': { $exists: false }, 'offer.sentAt': { $exists: true } },
      { $set: { 'offer.viewedAt': now, 'offer.expiresAt': offerExpiresAt } },
      { new: true },
    ).lean();
    const order = viewed || await this.orderModel.findOne({ _id: id, customer: customerId }).lean();
    if (!order) throw new NotFoundException('Pedido não encontrado.');
    return order;
  }
}
