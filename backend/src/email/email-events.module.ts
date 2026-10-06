import { Global, Injectable, Logger, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel, MongooseModule, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { randomUUID } from 'node:crypto';

export type StoreEmailEvent =
  | { type: 'customer.registered'; email: string; name: string }
  | { type: 'order.paid'; email: string; name: string; orderId: string; total: number }
  | { type: 'order.shipped'; email: string; name: string; orderId: string; trackingCode: string };

@Schema({ timestamps: true, collection: 'email_jobs' })
export class EmailJob {
  @Prop({ required: true, unique: true }) eventId!: string;
  @Prop({ required: true }) type!: string;
  @Prop({ required: true }) recipient!: string;
  @Prop({ type: Object, required: true }) payload!: StoreEmailEvent;
  @Prop({ required: true, enum: ['PENDING', 'SENDING', 'SENT', 'FAILED'], default: 'PENDING', index: true }) state!: string;
  @Prop({ required: true, default: 0 }) attempts!: number;
  @Prop({ type: Date, required: true, default: Date.now, index: true }) nextAttemptAt!: Date;
  @Prop() error?: string;
  @Prop({ type: Date }) sentAt?: Date;
  @Prop() providerId?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

@Injectable()
export class EmailEventsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmailEventsService.name);
  private timer?: NodeJS.Timeout;
  private processing = false;

  constructor(@InjectModel(EmailJob.name) private readonly jobs: Model<EmailJob>, private readonly config: ConfigService) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.process(), 10_000);
    this.timer.unref();
    setTimeout(() => void this.process(), 1_000).unref();
  }

  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  async publish(event: StoreEmailEvent) {
    try {
      await this.jobs.create({ eventId: randomUUID(), type: event.type, recipient: event.email.trim().toLowerCase(), payload: event, state: 'PENDING', attempts: 0, nextAttemptAt: new Date() });
      void this.process();
    } catch (error) {
      this.logger.warn(`Não foi possível registrar o e-mail ${event.type}: ${error instanceof Error ? error.message : 'erro desconhecido'}`);
    }
  }

  private async process() {
    if (this.processing) return;
    if (!this.config.get<string>('BREVO_API_KEY') || !this.config.get<string>('MAIL_FROM')) return;
    this.processing = true;
    try {
      for (let count = 0; count < 10; count++) {
        const now = new Date();
        const stale = new Date(now.getTime() - 5 * 60_000);
        const job = await this.jobs.findOneAndUpdate({ attempts: { $lt: 4 }, $or: [
          { state: { $in: ['PENDING', 'FAILED'] }, nextAttemptAt: { $lte: now } },
          { state: 'SENDING', updatedAt: { $lte: stale } },
        ] }, { $set: { state: 'SENDING' }, $inc: { attempts: 1 } }, { new: true }).lean();
        if (!job) break;
        try {
          const message = this.message(job.payload);
          const providerId = await this.send(job.eventId, job.recipient, job.payload.name, message);
          await this.jobs.updateOne({ _id: job._id, state: 'SENDING' }, { $set: { state: 'SENT', sentAt: new Date(), providerId }, $unset: { error: 1 } });
        } catch (error) {
          const delayMinutes = Math.min(30, 2 ** job.attempts);
          await this.jobs.updateOne({ _id: job._id, state: 'SENDING' }, { $set: { state: 'FAILED', error: this.error(error), nextAttemptAt: new Date(Date.now() + delayMinutes * 60_000) } });
        }
      }
    } finally { this.processing = false; }
  }

  private async send(eventId: string, recipient: string, recipientName: string, message: { subject: string; text: string }) {
    const response = await fetch(this.config.get<string>('BREVO_API_URL') || 'https://api.brevo.com/v3/smtp/email', {
      method: 'POST', signal: AbortSignal.timeout(15_000),
      headers: { accept: 'application/json', 'content-type': 'application/json', 'api-key': this.config.getOrThrow<string>('BREVO_API_KEY') },
      body: JSON.stringify({
        sender: { name: this.config.get<string>('MAIL_FROM_NAME') || 'IoT Componentes', email: this.config.getOrThrow<string>('MAIL_FROM') },
        to: [{ email: recipient, name: recipientName || 'Cliente' }], subject: message.subject, textContent: message.text,
        headers: { 'Idempotency-Key': eventId },
      }),
    });
    const body = await response.text();
    if (!response.ok) throw new Error(`Brevo HTTP ${response.status}: ${body.slice(0, 500)}`);
    try { return String((JSON.parse(body) as { messageId?: string }).messageId || 'accepted'); }
    catch { return 'accepted'; }
  }

  private message(event: StoreEmailEvent) {
    const name = event.name?.trim() || 'cliente';
    if (event.type === 'customer.registered') return { subject: 'Bem-vindo à IoT Componentes', text: `Olá, ${name}!\n\nSua conta na IoT Componentes foi criada com sucesso.\n\nVocê já pode acompanhar pedidos e acessar seus projetos no Meu Lab.\n\nEquipe IoT Componentes` };
    const order = event.orderId.slice(-8);
    if (event.type === 'order.paid') return { subject: `Pagamento confirmado — pedido #${order}`, text: `Olá, ${name}!\n\nConfirmamos o pagamento do pedido #${order}.\nTotal: ${event.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}\n\nProjetos digitais já estão disponíveis no Meu Lab. Para produtos físicos, avisaremos quando o pedido for enviado.\n\nEquipe IoT Componentes` };
    const tracking = event.trackingCode.toUpperCase();
    return { subject: `Pedido enviado — #${order}`, text: `Olá, ${name}!\n\nSeu pedido #${order} foi enviado.\n\nCódigo de rastreamento: ${tracking}\nAcompanhe a entrega: https://rastreamento.correios.com.br/app/index.php?objetos=${encodeURIComponent(tracking)}\n\nEquipe IoT Componentes` };
  }

  private error(error: unknown) { return (error instanceof Error ? error.message : 'Erro SMTP desconhecido').slice(0, 1000); }
}

@Global()
@Module({ imports: [MongooseModule.forFeature([{ name: EmailJob.name, schema: SchemaFactory.createForClass(EmailJob) }])], providers: [EmailEventsService], exports: [EmailEventsService] })
export class EmailEventsModule {}
