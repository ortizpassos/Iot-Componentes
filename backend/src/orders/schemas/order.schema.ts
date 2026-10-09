import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { CheckoutProfileDto } from '../../users/checkout-profile.dto';
import type { ShippingSender } from '../../admin/shipping-label';
import { InstallmentFeePayer } from '../../products/schemas/product.schema';

export enum ProgrammingType {
  NONE = 'NONE',
  STANDARD = 'STANDARD',
  AI = 'AI',
  CUSTOM = 'CUSTOM',
}

export enum OrderStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  LABEL_ISSUED = 'LABEL_ISSUED',
  CANCELLED = 'CANCELLED',
  FULFILLED = 'FULFILLED',
  SHIPPED = 'SHIPPED',
}

@Schema({ _id: false })
export class ProgrammingRequest {
  @Prop({ required: true, default: false })
  requested!: boolean;

  @Prop({ type: String, enum: ProgrammingType, default: ProgrammingType.NONE })
  type!: ProgrammingType;

  @Prop()
  requirements?: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Project' })
  projectId?: Types.ObjectId;
}
const ProgrammingRequestSchema = SchemaFactory.createForClass(ProgrammingRequest);

@Schema({ _id: false })
export class ItemOffer {
  @Prop({ required: true, min: 0, max: 100 })
  discountPercent!: number;

  @Prop({ required: true, default: false })
  freeShipping!: boolean;
}
const ItemOfferSchema = SchemaFactory.createForClass(ItemOffer);

@Schema({ _id: false })
export class OrderItem {
  @Prop({ type: String, index: true }) storeProjectId?: string;
  @Prop({ type: String, enum: ['DIGITAL', 'PHYSICAL'] }) deliveryKind?: string;
  @Prop({ type: String, enum: InstallmentFeePayer })
  installmentFeePayer?: InstallmentFeePayer;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Product', required: true })
  productId!: Types.ObjectId;

  @Prop({ required: true })
  sku!: string;

  @Prop({ required: true })
  name!: string;

  @Prop({ required: true, min: 1 })
  quantity!: number;

  @Prop({ required: true, min: 0 })
  unitPrice!: number;

  @Prop({ required: true, min: 0 })
  total!: number;

  @Prop({ type: ItemOfferSchema })
  offer?: ItemOffer;

  @Prop({ type: ProgrammingRequestSchema, required: true })
  programmingRequest!: ProgrammingRequest;
}
const OrderItemSchema = SchemaFactory.createForClass(OrderItem);

@Schema({ _id: false })
export class OrderShipping {
  @Prop({ required: true }) serviceId!: string;
  @Prop({ required: true }) name!: string;
  @Prop({ required: true, min: 0 }) price!: number;
  @Prop({ min: 0 }) deliveryDays?: number;
}
const OrderShippingSchema = SchemaFactory.createForClass(OrderShipping);

@Schema({ _id: false })
export class OrderOffer {
  @Prop({ required: true, min: 0, max: 100 }) discountPercent!: number;
  @Prop({ required: true, default: false }) freeShipping!: boolean;
  @Prop({ min: 0 }) freeShippingMinimum?: number;
  @Prop({ type: String, maxlength: 200 }) gift?: string;
  @Prop({ required: true }) sentAt!: Date;
  @Prop({ type: Date }) viewedAt?: Date;
  @Prop({ type: Date }) expiresAt?: Date;
}
const OrderOfferSchema = SchemaFactory.createForClass(OrderOffer);

@Schema({ timestamps: true })
export class Order {
  @Prop({ default: true }) requiresShipping?: boolean;
  @Prop({ type: Date })
  manuallyPaidAt?: Date;
  @Prop({ type: Date })
  labelRequestedAt?: Date;
  @Prop({ type: String })
  trackingCode?: string;
  @Prop({ type: Date })
  labelIssuedAt?: Date;
  @Prop({ type: Object, select: false })
  printJob?: { token: string; state: 'CLAIMED' | 'PRINTING' | 'DONE' | 'ERROR'; claimedAt: Date; error?: string };

  @Prop({ type: Object })
  shippingSender?: ShippingSender;
  @Prop({ type: Date })
  shippedAt?: Date;
  @Prop({ type: Object })
  checkoutProfile?: CheckoutProfileDto;
  @Prop({ type: Object, select: false })
  payment?: {
    key: string; method: string; status: string; statusDetail?: string; providerId?: string;
    qrCode?: string; qrBase64?: string; expiresAt?: string; updatedAt?: string;
    cardSaving?: 'saved' | 'failed';
  };

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true, index: true })
  customer!: Types.ObjectId;

  @Prop({ type: String, enum: OrderStatus, default: OrderStatus.PENDING })
  status!: OrderStatus;

  @Prop({ type: Date })
  reservationExpiresAt?: Date;

  @Prop({ type: Date })
  stockReleasedAt?: Date;

  @Prop({ type: Date })
  paymentReminderSentAt?: Date;

  @Prop({ type: Date })
  paymentOpenedAt?: Date;

  @Prop({ required: true, min: 0 })
  total!: number;

  @Prop({ type: OrderShippingSchema })
  shipping?: OrderShipping;

  @Prop({ type: OrderOfferSchema })
  offer?: OrderOffer;

  @Prop({ type: [OrderItemSchema], required: true })
  items!: OrderItem[];
}

export type OrderDocument = HydratedDocument<Order>;
export const OrderSchema = SchemaFactory.createForClass(Order);
