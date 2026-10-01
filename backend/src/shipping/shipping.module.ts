import { BadGatewayException, BadRequestException, Body, Controller, Get, Injectable, Module, Post, Query, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel, MongooseModule } from '@nestjs/mongoose';
import { IsInt, IsString, Matches, Max, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { Model, Types } from 'mongoose';
import { Product, ProductDocument, ProductSchema } from '../products/schemas/product.schema';
import { SettingsModule, SettingsService } from '../settings/settings.module';

export class ShippingQuoteItemDto {
  @IsString() productId!: string;
  @IsInt() @Min(1) @Max(10000) quantity!: number;
}

export class ShippingQuoteDto {
  @IsString() @Matches(/^\d{8}$/, { message: 'Informe o CEP de destino com 8 números.' }) destinationZipCode!: string;
  @ValidateNested({ each: true }) @Type(() => ShippingQuoteItemDto) items!: ShippingQuoteItemDto[];
}

interface SuperFreteQuote { id: string | number; name: string; price?: string | number; delivery_time?: number; delivery_range?: { min?: number; max?: number }; has_error?: boolean }
interface SuperFreteServiceQuote { code: string; name: string; price: number; deliveryDays: number | null }

@Injectable()
export class ShippingService {
  constructor(
    @InjectModel(Product.name) private readonly products: Model<ProductDocument>,
    private readonly settings: SettingsService,
    private readonly config: ConfigService,
  ) {}

  async quote(dto: ShippingQuoteDto) {
    const sender = await this.settings.getShippingSender();
    const origin = sender?.address?.zipCode?.replace(/\D/g, '');
    if (!origin) throw new BadRequestException('Cadastre o CEP do remetente antes de calcular o frete.');
    if (!dto.items?.length) throw new BadRequestException('Adicione ao menos um produto para calcular o frete.');

    const products = await this.products.find({ _id: { $in: dto.items.map(item => item.productId) }, active: true }).lean();
    if (products.length !== dto.items.length) throw new BadRequestException('Um dos produtos não está disponível para frete.');
    const byId = new Map(products.map(product => [String(product._id), product]));
    const productsForQuote: { quantity: number; height: number; length: number; width: number; weight: number }[] = [];
    for (const item of dto.items) {
      if (!Types.ObjectId.isValid(item.productId)) throw new BadRequestException('Produto inválido para cálculo do frete.');
      const product = byId.get(item.productId);
      if (!product || !product.weightGrams || !product.lengthCm || !product.widthCm || !product.heightCm) {
        throw new BadRequestException(`Cadastre peso e dimensões de ${product?.name || 'cada produto'} antes de calcular o frete.`);
      }
      productsForQuote.push({ quantity: item.quantity, height: product.heightCm, length: product.lengthCm, width: product.widthCm, weight: product.weightGrams / 1000 });
    }
    const token = this.config.get<string>('SUPERFRETE_TOKEN')?.trim();
    if (!token) throw new ServiceUnavailableException('Configure SUPERFRETE_TOKEN para consultar o frete.');
    const baseUrl = this.config.get<string>('SUPERFRETE_BASE_URL')?.trim() || 'https://api.superfrete.com';
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/api/v0/calculator`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': this.config.get<string>('SUPERFRETE_USER_AGENT') || 'IoT Componentes (suporte@iot-componentes.com.br)' },
        body: JSON.stringify({ from: { postal_code: origin }, to: { postal_code: dto.destinationZipCode }, services: '1,2', options: { own_hand: false, receipt: false, insurance_value: 0, use_insurance_value: false }, products: productsForQuote }),
        signal: AbortSignal.timeout(10000),
      });
    } catch { throw new BadGatewayException('Não foi possível consultar a SuperFrete.'); }
    if (response.status === 401 || response.status === 403) throw new ServiceUnavailableException('O token da SuperFrete é inválido ou expirou.');
    if (!response.ok) throw new BadGatewayException('A SuperFrete não respondeu ao cálculo do frete.');
    const data = await response.json() as SuperFreteQuote[];
    const services = data.map(service => this.parseService(service)).filter((service): service is SuperFreteServiceQuote => !!service);
    if (!services.length) throw new BadGatewayException('A SuperFrete não retornou modalidades para este CEP.');
    return { originZipCode: origin, destinationZipCode: dto.destinationZipCode, services };
  }

  private parseService(service: SuperFreteQuote): SuperFreteServiceQuote | null {
    const price = Number(service.price);
    if (service.has_error || !Number.isFinite(price)) return null;
    return { code: String(service.id), name: service.name, price, deliveryDays: service.delivery_time || service.delivery_range?.max || null };
  }
}

@Controller('shipping')
export class ShippingController {
  constructor(private readonly shipping: ShippingService) {}
  @Get('oauth/callback') callback(@Query('code') code?: string, @Query('error') error?: string) {
    if (error) throw new BadRequestException(`Autorização do Melhor Envio recusada: ${error}.`);
    if (!code) throw new BadRequestException('O Melhor Envio não retornou um código de autorização.');
    return { code };
  }
  @Post('quote') quote(@Body() dto: ShippingQuoteDto) { return this.shipping.quote(dto); }
}

@Module({
  imports: [SettingsModule, MongooseModule.forFeature([{ name: Product.name, schema: ProductSchema }])],
  controllers: [ShippingController],
  providers: [ShippingService],
  exports: [ShippingService],
})
export class ShippingModule {}