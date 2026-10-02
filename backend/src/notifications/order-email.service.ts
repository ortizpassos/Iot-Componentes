import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import * as nodemailer from 'nodemailer';
import { Model } from 'mongoose';
import { Order, OrderStatus } from '../orders/schemas/order.schema';
import { UsersService } from '../users/users.service';

@Injectable()
export class OrderEmailService {
  private readonly logger = new Logger(OrderEmailService.name);

  constructor(
    @InjectModel(Order.name) private readonly orders: Model<Order>,
    private readonly users: UsersService,
    private readonly config: ConfigService,
  ) {}

  async notifyPaidOrder(orderId: string) {
    const host = this.config.get<string>('SMTP_HOST');
    if (!host) return;

    const now = new Date();
    const order = await this.orders.findOneAndUpdate(
      { _id: orderId, status: OrderStatus.PAID, emailSentAt: { $exists: false }, $or: [{ emailClaimedAt: { $exists: false } }, { emailClaimedAt: { $lt: new Date(now.getTime() - 10 * 60 * 1000) } }] },
      { $set: { emailClaimedAt: now } },
      { new: true },
    ).lean();
    if (!order) return;

    try {
      const customer = await this.users.checkout(String(order.customer));
      const transporter = nodemailer.createTransport({
        host,
        port: Number(this.config.get<string>('SMTP_PORT') || 587),
        secure: this.config.get<string>('SMTP_SECURE') === 'true',
        auth: this.config.get<string>('SMTP_USER') ? { user: this.config.get<string>('SMTP_USER'), pass: this.config.get<string>('SMTP_PASSWORD') } : undefined,
      });
      const from = this.config.get<string>('SMTP_FROM') || this.config.get<string>('SMTP_USER');
      if (!from) throw new Error('SMTP_FROM ou SMTP_USER nao configurado');
      const orderNumber = String(order._id).slice(-8).toUpperCase();
      const itemLines = order.items.map(item => `${item.quantity} x ${item.name} (${this.money(item.total)})`).join('\n');
      const shipping = order.shipping ? `\nFrete: ${order.shipping.name} - ${this.money(order.shipping.price)}` : '';
      await transporter.sendMail({
        from,
        to: customer.email,
        subject: `Compra confirmada - pedido #${orderNumber}`,
        text: `Ola, ${order.checkoutProfile?.fullName || customer.name}!\n\nSua compra foi confirmada.\n\nPedido #${orderNumber}\n${itemLines}${shipping}\nTotal: ${this.money(order.total)}\n\nObrigado por comprar na IOT-Componentes.`,
        html: `<p>Ola, ${this.escape(order.checkoutProfile?.fullName || customer.name)}!</p><p>Sua compra foi confirmada.</p><h2>Pedido #${orderNumber}</h2><ul>${order.items.map(item => `<li>${item.quantity} x ${this.escape(item.name)} - ${this.money(item.total)}</li>`).join('')}</ul>${order.shipping ? `<p>Frete: ${this.escape(order.shipping.name)} - ${this.money(order.shipping.price)}</p>` : ''}<p><strong>Total: ${this.money(order.total)}</strong></p><p>Obrigado por comprar na IOT-Componentes.</p>`,
      });
      await this.orders.updateOne({ _id: order._id, emailClaimedAt: now }, { $set: { emailSentAt: new Date() }, $unset: { emailClaimedAt: 1 } });
    } catch (error) {
      await this.orders.updateOne({ _id: order._id, emailClaimedAt: now }, { $unset: { emailClaimedAt: 1 } });
      this.logger.error(`Falha ao enviar confirmacao do pedido ${orderId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private money(value: number) { return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
  private escape(value: string) { return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] || character); }
}
