import { BadRequestException, ConflictException, Injectable, NotFoundException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { Order, OrderStatus } from '../orders/schemas/order.schema';
import { CreatePaymentDto } from './payment.dto';
import { MercadoPagoService, ProviderError, ProviderPayment } from './mercado-pago.service';
import { UsersService } from '../users/users.service';
import { ProductsService } from '../products/products.service';

export const RETRYABLE = ['rejected', 'cancelled', 'failed'];
export function eligible(order: Order) {
  return order.status === OrderStatus.PENDING && order.total > 0 && order.items.length > 0 && order.items.every(i => !i.programmingRequest.requested && i.programmingRequest.type === 'NONE');
}
export function verifySignature(secret: string, id: string, requestId: string, signature: string) {
  const parts = Object.fromEntries(signature.split(',').map(part => part.trim().split('=')));
  if (!secret || !/^\d+$/.test(id) || !requestId || !/^\d+$/.test(parts.ts || '') || !/^[a-f0-9]{64}$/i.test(parts.v1 || '')) return false;
  const signed = `id:${id};request-id:${requestId};ts:${parts.ts};`;
  const digest = createHmac('sha256', secret).update(signed).digest();
  return timingSafeEqual(digest, Buffer.from(parts.v1, 'hex'));
}
@Injectable()
export class PaymentsService {
  constructor(@InjectModel(Order.name) private readonly orders: Model<Order>, private readonly provider: MercadoPagoService, private readonly config: ConfigService, private readonly users: UsersService, private readonly products: ProductsService) {}
  async savedCard(customer: string) {
    const user = await this.users.checkout(customer);
    return user.defaultCard && user.mercadoPagoCustomerId
      ? { customerId: user.mercadoPagoCustomerId, card: user.defaultCard }
      : { customerId: null, card: null };
  }
  forgetCard(customer: string) { return this.users.forgetDefaultCard(customer); }
  private async owned(customer: string, id: string) {
    if (!Types.ObjectId.isValid(id)) throw new BadRequestException('Pedido inválido.');
    const order = await this.orders.findOne({ _id: id, customer }).select('+payment').lean();
    if (!order) throw new NotFoundException('Pedido não encontrado.');
    return order;
  }
  private view(order: Order & { _id: Types.ObjectId }) {
    const p = order.payment;
    return { orderId: String(order._id), total: order.total, orderStatus: order.status, eligible: eligible(order), checkoutProfile: order.checkoutProfile || null,
      canPay: eligible(order) && (!p || RETRYABLE.includes(p.status)),
      payment: p ? { status: p.status, statusDetail: p.statusDetail, method: p.method, providerId: p.providerId, qrCode: p.status === 'pending' ? p.qrCode : undefined, qrBase64: p.status === 'pending' ? p.qrBase64 : undefined, expiresAt: p.expiresAt, cardSaving: p.cardSaving } : null };
  }
  async status(customer: string, id: string) {
    let order = await this.owned(customer, id);
    if (order.payment && order.payment.status !== 'failed') {
      try {
        const payments = order.payment.providerId ? [await this.provider.get(order.payment.providerId)] : await this.provider.search(`${id}:${order.payment.key}`);
        for (const payment of payments) await this.apply(payment);
        order = await this.owned(customer, id);
      } catch (error) { if (!(error instanceof ProviderError)) throw error; }
    }
    return this.view(order);
  }
  async create(customer: string, id: string, dto: CreatePaymentDto) {
    if (!this.provider.configuration().enabled) throw new ServiceUnavailableException('Pagamento ainda não configurado pela loja.');
    const order = await this.owned(customer, id);
    if (!eligible(order)) throw new ConflictException('Este pedido não está disponível para pagamento online.');
    if (order.payment && !RETRYABLE.includes(order.payment.status)) return this.status(customer, id);
    for (const item of order.items) {
      const product = await this.products.findById(String(item.productId));
      if (!product.active || !Number.isInteger(product.stock) || !Number.isInteger(item.quantity) || item.quantity > product.stock || item.quantity < 1) throw new ConflictException(`Estoque insuficiente para ${item.name || product.name}. Revise o pedido antes de pagar.`);
    }
    const checkoutProfile = order.checkoutProfile || await this.users.requireCheckoutProfile(customer);
    if (dto.method !== 'card' && (dto.saveCard || dto.useSavedCard)) throw new BadRequestException('Esta opção está disponível somente para cartão.');
    const saved = dto.useSavedCard ? await this.savedCard(customer) : null;
    if (dto.useSavedCard && !saved?.card) throw new BadRequestException('Nenhum cartão padrão cadastrado.');
    if (!dto.payer?.email || !dto.payer.identification) throw new BadRequestException('Informe e-mail e documento do pagador.');
    if (dto.method === 'card' && (!dto.token || !dto.paymentMethodId || dto.paymentMethodId === 'pix' || !dto.installments)) throw new BadRequestException('Dados do cartão incompletos.');
    const key = randomUUID();
    const claimed = await this.orders.findOneAndUpdate({ _id: id, customer, status: OrderStatus.PENDING,
      $or: [{ payment: { $exists: false } }, { 'payment.status': { $in: RETRYABLE } }],
    }, { $set: { checkoutProfile, payment: { key, method: dto.method, status: 'creating' } } }, { new: true }).select('+payment').lean();
    if (!claimed) return this.status(customer, id);
    const notificationUrl = this.config.get<string>('MP_NOTIFICATION_URL');
    const body = {
      transaction_amount: order.total, description: `IOT-Componentes - Pedido ${id}`,
      ...(dto.method === 'card' ? { statement_descriptor: 'IOT-COMPONENT' } : {}),
      external_reference: `${id}:${key}`, payer: saved ? { ...dto.payer, type: 'customer', id: saved.customerId } : dto.payer,
      ...(notificationUrl ? { notification_url: notificationUrl } : {}),
      ...(dto.method === 'pix' ? { payment_method_id: 'pix' } : { token: dto.token, payment_method_id: dto.paymentMethodId, installments: dto.installments, ...(dto.issuerId ? { issuer_id: dto.issuerId } : {}) }),
    };
    let response: ProviderPayment;
    try { response = await this.provider.create(body, key); await this.apply(response); }
    catch (error) {
      // A timeout or ambiguous response must never unlock the order for another charge.
      if (error instanceof ProviderError && [400, 422].includes(error.status)) {
        await this.orders.updateOne({ _id: id, 'payment.key': key, 'payment.status': 'creating', 'payment.providerId': { $exists: false } }, { $set: { 'payment.status': 'failed' } });
        throw new BadRequestException('Mercado Pago não aceitou os dados. Confira o formulário e tente novamente.');
      }
      throw new ServiceUnavailableException('Não foi possível confirmar o resultado. Verifique o pagamento antes de tentar novamente.');
    }
    // Saving is optional and must never turn a successful charge into a retryable failure.
    // The one-use token stays in memory only, never in MongoDB or logs.
    if (dto.method === 'card' && dto.saveCard && !dto.useSavedCard && ['approved', 'in_process', 'authorized'].includes(response.status)) {
      let cardSaving: 'saved' | 'failed' = 'failed';
      try {
        const user = await this.users.checkout(customer);
        const customerId = user.mercadoPagoCustomerId || await this.users.linkPaymentCustomer(customer, (await this.provider.createCustomer(user.email, `store-user-${customer}`)).id);
        const card = await this.provider.saveCard(customerId, dto.token!);
        if (!card.id || !/^\d{4}$/.test(String(card.last_four_digits))) throw new Error('Invalid saved card');
        await this.users.saveDefaultCard(customer, { id: String(card.id), lastFour: String(card.last_four_digits), brand: card.payment_method.id, savedAt: new Date().toISOString() });
        cardSaving = 'saved';
      } catch { /* Preserve the payment result; surface a separate, non-retryable notice. */ }
      await this.orders.updateOne({ _id: id, 'payment.key': key }, { $set: { 'payment.cardSaving': cardSaving } });
    }
    return this.view(await this.owned(customer, id));
  }
  async changeMethod(customer: string, id: string) {
    const order = await this.owned(customer, id);
    if (!eligible(order)) throw new ConflictException('Este pedido não permite alterar o pagamento.');
    if (!order.payment || RETRYABLE.includes(order.payment.status)) return this.view(order);
    if (order.payment.status !== 'pending' || !order.payment.providerId) throw new ConflictException('Pagamento em processamento. Aguarde a confirmação antes de alterar.');
    try {
      const current = await this.provider.get(order.payment.providerId);
      await this.apply(current);
      if (current.status === 'pending') {
        const cancelled = await this.provider.cancel(order.payment.providerId);
        await this.apply(cancelled);
        if (cancelled.status !== 'cancelled') throw new ConflictException('O cancelamento ainda não foi confirmado. Verifique o pagamento antes de alterar.');
      }
    } catch (error) {
      if (error instanceof ProviderError) throw new ServiceUnavailableException('Não foi possível confirmar o cancelamento. Verifique o pagamento antes de tentar novamente.');
      throw error;
    }
    return this.view(await this.owned(customer, id));
  }
  async apply(payment: ProviderPayment) {
    const [id, key] = (payment.external_reference || '').split(':');
    if (!Types.ObjectId.isValid(id || '') || !key) return;
    const order = await this.orders.findOne({ _id: id, 'payment.key': key }).select('+payment').lean();
    if (!order?.payment) return;
    if (order.payment.status === 'cancelled' && ['pending', 'in_process', 'authorized'].includes(payment.status)) return;
    if (payment.currency_id !== 'BRL' || Math.round(payment.transaction_amount * 100) !== Math.round(order.total * 100)) throw new ConflictException('Pagamento não corresponde ao valor do pedido.');
    if (order.payment.providerId && order.payment.providerId !== String(payment.id)) throw new ConflictException('Pagamento divergente.');
    const updatedAt = new Date(payment.date_last_updated || Date.now()).toISOString();
    const update: Record<string, unknown> = {
      'payment.statusDetail': payment.status_detail,
      'payment.providerId': String(payment.id), 'payment.status': payment.status, 'payment.updatedAt': updatedAt,
      'payment.qrCode': payment.point_of_interaction?.transaction_data?.qr_code,
      'payment.qrBase64': payment.point_of_interaction?.transaction_data?.qr_code_base64,
      'payment.expiresAt': payment.date_of_expiration,
    };
    // Only the server-to-server response can approve a pending order.
    if (payment.status === 'approved' && order.status === OrderStatus.PENDING) update.status = OrderStatus.PAID;
    if (['refunded', 'charged_back'].includes(payment.status)) update.status = OrderStatus.CANCELLED;
    await this.orders.updateOne({ _id: id, 'payment.key': key, status: order.status,
      $or: [{ 'payment.updatedAt': { $exists: false } }, { 'payment.updatedAt': { $lte: updatedAt } }],
    }, { $set: update });
  }
  async webhook(id: string, requestId: string, signature: string) {
    if (!verifySignature(this.config.get<string>('MP_WEBHOOK_SECRET') || '', id || '', requestId || '', signature || '')) throw new UnauthorizedException('Assinatura inválida.');
    try { await this.apply(await this.provider.get(id)); }
    catch (error) { if (error instanceof ProviderError) throw new ServiceUnavailableException(); throw error; }
    return { received: true };
  }
}
