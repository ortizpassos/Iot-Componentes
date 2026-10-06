import { Global, Injectable, Logger, Module, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Channel, ChannelModel, connect } from 'amqplib';
import { randomUUID } from 'node:crypto';

export type StoreEmailEvent =
  | { type: 'customer.registered'; email: string; name: string }
  | { type: 'order.paid'; email: string; name: string; orderId: string; total: number }
  | { type: 'order.shipped'; email: string; name: string; orderId: string; trackingCode: string };

@Injectable()
export class EmailEventsService implements OnModuleDestroy {
  private readonly logger = new Logger(EmailEventsService.name);
  private connection?: ChannelModel;
  private channel?: Channel;
  private connecting?: Promise<Channel>;

  constructor(private readonly config: ConfigService) {}

  private async getChannel() {
    if (this.channel) return this.channel;
    if (this.connecting) return this.connecting;
    const url = this.config.get<string>('RABBITMQ_URL');
    if (!url) throw new Error('RABBITMQ_URL is not configured');
    this.connecting = (async () => {
      this.connection = await connect(url);
      this.connection.on('close', () => { this.channel = undefined; this.connection = undefined; });
      this.connection.on('error', () => undefined);
      const channel = await this.connection.createChannel();
      await channel.assertExchange(this.config.get<string>('EMAIL_EXCHANGE') || 'iot-componentes.exchange', 'direct', { durable: true });
      this.channel = channel;
      return channel;
    })().finally(() => { this.connecting = undefined; });
    return this.connecting;
  }

  async publish(event: StoreEmailEvent) {
    if (!this.config.get<string>('RABBITMQ_URL')) return;
    try {
      const channel = await this.getChannel();
      const sent = channel.publish(
        this.config.get<string>('EMAIL_EXCHANGE') || 'iot-componentes.exchange',
        this.config.get<string>('EMAIL_ROUTING_KEY') || 'email.outbox',
        Buffer.from(JSON.stringify({ ...event, eventId: randomUUID(), occurredAt: new Date().toISOString() })),
        { contentType: 'application/json', deliveryMode: 2 },
      );
      if (!sent) this.logger.warn(`RabbitMQ buffer full while publishing ${event.type}`);
    } catch (error) {
      this.channel = undefined;
      this.logger.warn(`Email event ${event.type} was not published: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }

  async onModuleDestroy() {
    try { await this.channel?.close(); } catch {}
    try { await this.connection?.close(); } catch {}
  }
}

@Global()
@Module({ providers: [EmailEventsService], exports: [EmailEventsService] })
export class EmailEventsModule {}
