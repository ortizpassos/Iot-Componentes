import { Body, Controller, Get, Injectable, Module, Put, UseGuards } from '@nestjs/common';
import { InjectModel, MongooseModule, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsEmail, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Max, MaxLength, Min, ValidateIf, ValidateNested } from 'class-validator';
import { IsProductImageUrl } from '../products/image-url.validator';
import { AdminGuard } from '../common/guards/admin.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ShippingSender } from '../admin/shipping-label';

export const defaults = {
  storeName: 'IoT Componentes', tagline: 'Da ideia ao dispositivo.',
  catalogTitle: 'Componentes para suas ideias.', catalogDescription: 'Encontre a próxima peça do seu projeto.',
  bannerTitle: 'Pequenos componentes. Grandes possibilidades.',
  bannerDescription: 'Escolha sua placa e solicite a programação que o seu projeto precisa.',
  announcement: '', contactEmail: '',
  bannerSlides: [] as BannerSlideDto[], bannerInterval: 6,
  globalOffer: { enabled: false, discountEnabled: false, title: '', description: '', discountPercent: 0, freeShipping: false, freeShippingMinimum: 0, gift: '', expiresAt: '' },
};
export class GlobalOfferDto {
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsBoolean() discountEnabled?: boolean;
  @IsOptional() @IsString() @MaxLength(120) title?: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(100) discountPercent?: number;
  @IsOptional() @IsBoolean() freeShipping?: boolean;
  @IsOptional() @IsNumber() @Min(0) freeShippingMinimum?: number;
  @IsOptional() @IsString() @MaxLength(200) gift?: string;
  @IsOptional() @IsString() @MaxLength(40) expiresAt?: string;
}
export class BannerSlideDto {
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @IsNotEmpty() @MaxLength(120) title!: string;
  @IsString() @MaxLength(500) description!: string;
  @IsString() @IsProductImageUrl() imageUrl!: string;
}
export class StoreSettingsDto {
  @ValidateIf((o) => o.bannerSlides !== undefined) @IsArray() @ArrayMaxSize(10) @ValidateNested({ each: true }) @Type(() => BannerSlideDto)
  bannerSlides?: BannerSlideDto[];
  @ValidateIf((o) => o.bannerInterval !== undefined) @IsInt() @Min(3) @Max(30) bannerInterval?: number;
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @IsNotEmpty() @MaxLength(60) storeName!: string;
  @IsString() @MaxLength(120) tagline!: string;
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @IsNotEmpty() @MaxLength(120) catalogTitle!: string;
  @IsString() @MaxLength(500) catalogDescription!: string;
  @IsString() @MaxLength(120) bannerTitle!: string;
  @IsString() @MaxLength(500) bannerDescription!: string;
  @IsString() @MaxLength(500) announcement!: string;
  @IsOptional() @ValidateNested() @Type(() => GlobalOfferDto) globalOffer?: GlobalOfferDto;
  @IsString() @MaxLength(254) @ValidateIf((o) => o.contactEmail !== '') @IsEmail() contactEmail!: string;
}
@Schema({ timestamps: true })
export class StoreSettings {
  @Prop({ type: Object, select: false }) shippingSender?: ShippingSender;
  @Prop({ unique: true, default: 'store' }) key!: string;
  @Prop({ type: Object, default: defaults }) content!: typeof defaults;
}
export const StoreSettingsSchema = SchemaFactory.createForClass(StoreSettings);
@Injectable()
export class SettingsService {
  async getShippingSender() {
    const doc = await this.model.findOne({ key: 'store' }).select('+shippingSender').lean();
    return doc?.shippingSender;
  }
  async saveShippingSender(sender: ShippingSender) {
    await this.model.findOneAndUpdate({ key: 'store' }, { $set: { shippingSender: sender } }, { upsert: true, runValidators: true });
    return { sender };
  }
  constructor(@InjectModel(StoreSettings.name) private readonly model: Model<StoreSettings>) {}
  async get() {
    const doc = await this.model.findOne({ key: 'store' }).lean();
    const content = { ...defaults, ...doc?.content };
    if (['iot lab', 'iot componentes', 'iot components'].includes(content.storeName.trim().toLowerCase())) content.storeName = defaults.storeName;
    return content;
  }
  async save(dto: StoreSettingsDto) {
    const doc = await this.model.findOneAndUpdate({ key: 'store' }, { $set: { content: dto } }, { new: true, upsert: true, runValidators: true }).lean();
    return { ...defaults, ...doc.content };
  }
}
@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}
  @Get() get() { return this.settings.get(); }
  @Get('shipping-sender') @UseGuards(JwtAuthGuard, AdminGuard)
  async sender() { return { sender: await this.settings.getShippingSender() || null }; }
  @Put('shipping-sender') @UseGuards(JwtAuthGuard, AdminGuard)
  saveSender(@Body() dto: ShippingSender) { return this.settings.saveShippingSender(dto); }
  @Put() @UseGuards(JwtAuthGuard, AdminGuard)
  save(@Body() dto: StoreSettingsDto) { return this.settings.save(dto); }
}
@Module({ imports: [MongooseModule.forFeature([{ name: StoreSettings.name, schema: StoreSettingsSchema }])], controllers: [SettingsController], providers: [SettingsService], exports: [SettingsService] })
export class SettingsModule {}
