import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ProductDocument = HydratedDocument<Product>;

export enum InstallmentFeePayer {
  BUYER = 'BUYER',
  SELLER = 'SELLER',
}

export enum ProductType {
  BOARD = 'BOARD',
  SENSOR = 'SENSOR',
  MODULE = 'MODULE',
  KIT = 'KIT',
  ACCESSORY = 'ACCESSORY',
  SERVICE = 'SERVICE',
  MICROCONTROLLER_PIC = 'MICROCONTROLLER_PIC',
  ESP32 = 'ESP32',
  SEMICONDUCTOR = 'SEMICONDUCTOR',
  SMART_HOME = 'SMART_HOME',
}

@Schema({ _id: false })
export class ProductOffer {
  @Prop({ default: false }) enabled!: boolean;
  @Prop({ default: '' }) title!: string;
  @Prop({ default: '' }) description!: string;
  @Prop({ min: 0, max: 100, default: 0 }) discountPercent!: number;
  @Prop({ default: false }) freeShipping!: boolean;
  @Prop({ maxlength: 200 }) gift?: string;
  @Prop({ type: Date }) expiresAt?: Date;
}
const ProductOfferSchema = SchemaFactory.createForClass(ProductOffer);

@Schema({ timestamps: true })
export class Product {
  @Prop({ type: String, index: true }) storeProjectId?: string;
  @Prop({ type: String, enum: ['DIGITAL', 'PHYSICAL'], default: 'PHYSICAL' }) deliveryKind?: string;
  @Prop({ type: String })
  packagingId?: string;

  @Prop({ default: '' })
  datasheetUrl!: string;

  @Prop({ type: [{ _id: false, label: String, url: String }], default: [] })
  references!: { label: string; url: string }[];
  // Requested commercial policy; does not override Mercado Pago account pricing.
  @Prop({ type: String, enum: InstallmentFeePayer, default: InstallmentFeePayer.BUYER })
  installmentFeePayer!: InstallmentFeePayer;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ required: true, unique: true, trim: true })
  sku!: string;

  @Prop()
  description?: string;

  @Prop({ trim: true, default: '' })
  imageUrl!: string;

  @Prop({ type: [String], default: [], validate: { validator: (urls: string[]) => urls.length <= 4, message: 'Use no máximo quatro imagens adicionais.' } })
  additionalImageUrls!: string[];

  @Prop({ type: String, enum: ProductType, required: true })
  type!: ProductType;

  @Prop({ required: true, min: 0 })
  price!: number;

  @Prop({ default: 0, min: 0 })
  stock!: number;

  @Prop({ default: true })
  active!: boolean;

  @Prop()
  manufacturer?: string;

  @Prop()
  model?: string;

  @Prop({ min: 1 })
  weightGrams?: number;

  @Prop({ min: 1 })
  lengthCm?: number;

  @Prop({ min: 1 })
  widthCm?: number;

  @Prop({ min: 1 })
  heightCm?: number;

  @Prop({ type: Object, default: {} })
  specifications!: Record<string, unknown>;

  @Prop({ type: Object, default: {} })
  programming!: { supported?: boolean; platform?: string; chip?: string };

  @Prop({ type: ProductOfferSchema })
  offer?: ProductOffer;
}

export const ProductSchema = SchemaFactory.createForClass(Product);
