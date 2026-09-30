import { Body, CanActivate, ConflictException, Controller, ExecutionContext, HttpCode, Header, Injectable, Param, Post, ServiceUnavailableException, StreamableFile, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { IsIn, IsString, IsUUID, MaxLength } from 'class-validator';
import { Model, Types } from 'mongoose';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { Order, OrderStatus } from '../orders/schemas/order.schema';
import { SettingsService } from '../settings/settings.module';
import { shippingLabel } from './shipping-label';

export class PrintTokenDto { @IsUUID() token!: string; }
export class PrintResultDto extends PrintTokenDto {
  @IsIn(['accepted', 'error']) result!: 'accepted' | 'error';
  @IsString() @MaxLength(200) message!: string;
}
@Injectable()
export class PrintMonitorGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}
  canActivate(context: ExecutionContext) {
    const secret = this.config.get<string>('PRINT_MONITOR_TOKEN') || '';
    const supplied = context.switchToHttp().getRequest().headers['x-print-token'];
    if (secret.length < 32 || typeof supplied !== 'string') throw new UnauthorizedException();
    const a = Buffer.from(secret), b = Buffer.from(supplied);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new UnauthorizedException();
    return true;
  }
}

export async function renderPwg(pdf: Buffer): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), 'iot-label-'));
  try {
    const file = join(dir, 'label.pdf');
    await writeFile(file, pdf);
    const { stdout } = await promisify(execFile)('cupsfilter', ['-i', 'application/pdf', '-m', 'image/pwg-raster', '-o', 'media=A4', '-o', 'printer-resolution=300dpi', '-o', 'print-color-mode=monochrome', file], { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024, timeout: 90000 });
    if (stdout.subarray(0, 4).toString() !== 'RaS2') throw new Error('Invalid PWG');
    return stdout;
  } finally { await rm(dir, { recursive: true, force: true }); }
}

@Injectable()
export class PrintMonitorService {
  constructor(@InjectModel(Order.name) private readonly orders: Model<Order>, private readonly settings: SettingsService) {}
  async claim() {
    // Claim atomically; a repeated payment webhook cannot enqueue a second label.
    const order = await this.orders.findOneAndUpdate({ status: OrderStatus.PAID, 'payment.status': 'approved', printJob: { $exists: false } },
      { $set: { printJob: { token: randomUUID(), state: 'CLAIMED', claimedAt: new Date() } } },
      { new: true, sort: { createdAt: 1 } }).select('+printJob').lean();
    return order ? { id: String(order._id), token: order.printJob!.token } : null;
  }
  private filter(id: string, token: string) {
    if (!Types.ObjectId.isValid(id)) throw new ConflictException('Pedido invalido.');
    return { _id: new Types.ObjectId(id), 'printJob.token': token };
  }
  async data(id: string, token: string) {
    const filter = { ...this.filter(id, token), status: OrderStatus.PAID, 'printJob.state': 'CLAIMED' };
    const order = await this.orders.findOne(filter).lean();
    if (!order) throw new ConflictException('Trabalho indisponivel.');
    try {
      const sender = order.shippingSender || await this.settings.getShippingSender();
      const pdf = await shippingLabel(id, order.checkoutProfile, sender, order.items);
      const pwg = await renderPwg(pdf);
      const updated = await this.orders.updateOne(filter, { $set: { shippingSender: sender } });
      if (!updated.matchedCount) throw new ConflictException('Pedido alterado.');
      return pwg;
    } catch (error) {
      await this.orders.updateOne(filter, { $set: { 'printJob.state': 'ERROR', 'printJob.error': 'Falha ao gerar PWG. Verifique remetente, endereco e cupsfilter.' } });
      if (error instanceof ConflictException) throw error;
      throw new ServiceUnavailableException('Falha ao gerar arquivo de impressao.');
    }
  }
  async start(id: string, token: string) {
    const result = await this.orders.updateOne({ ...this.filter(id, token), status: OrderStatus.PAID, 'printJob.state': 'CLAIMED', shippingSender: { $exists: true } }, { $set: { 'printJob.state': 'PRINTING' } });
    if (!result.modifiedCount) throw new ConflictException('Impressao ja iniciada ou pedido alterado.');
    return { started: true };
  }
  async result(id: string, dto: PrintResultDto) {
    const filter = this.filter(id, dto.token);
    const accepted = dto.result === 'accepted';
    const result = await this.orders.updateOne({ ...filter, status: OrderStatus.PAID, 'printJob.state': { $in: accepted ? ['PRINTING'] : ['CLAIMED', 'PRINTING'] } }, { $set: accepted
      ? { status: OrderStatus.LABEL_ISSUED, labelIssuedAt: new Date(), 'printJob.state': 'DONE' }
      : { 'printJob.state': 'ERROR', 'printJob.error': dto.message } });
    if (!result.modifiedCount && !await this.orders.exists({ ...filter, 'printJob.state': accepted ? 'DONE' : 'ERROR' })) throw new ConflictException('Pedido alterado.');
    return { received: true };
  }
}

@Controller('print-monitor')
@UseGuards(PrintMonitorGuard)
export class PrintMonitorController {
  constructor(private readonly monitor: PrintMonitorService) {}
  @Post('claim') claim() { return this.monitor.claim(); }
  @Post(':id/data') @HttpCode(200) @Header('Cache-Control', 'no-store')
  async data(@Param('id') id: string, @Body() dto: PrintTokenDto) {
    const data = await this.monitor.data(id, dto.token);
    return new StreamableFile(data, { type: 'image/pwg-raster', length: data.length });
  }
  @Post(':id/start') start(@Param('id') id: string, @Body() dto: PrintTokenDto) { return this.monitor.start(id, dto.token); }
  @Post(':id/result') result(@Param('id') id: string, @Body() dto: PrintResultDto) { return this.monitor.result(id, dto); }
}
