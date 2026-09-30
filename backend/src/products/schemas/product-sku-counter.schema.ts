import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ProductSkuCounterDocument = HydratedDocument<ProductSkuCounter>;

@Schema({ collection: 'product_sku_counters' })
export class ProductSkuCounter {
  @Prop({ required: true, unique: true, trim: true })
  type!: string;

  @Prop({ required: true, default: 0, min: 0 })
  value!: number;
}

export const ProductSkuCounterSchema = SchemaFactory.createForClass(ProductSkuCounter);