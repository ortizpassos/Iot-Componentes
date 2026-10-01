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
}

@Schema({ timestamps: true })
export class Product {
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
}

export const ProductSchema = SchemaFactory.createForClass(Product);
