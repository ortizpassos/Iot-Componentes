import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { CheckoutProfileDto } from '../checkout-profile.dto';

export type UserDocument = HydratedDocument<User>;

export enum UserRole {
  CUSTOMER = 'CUSTOMER',
  ADMIN = 'ADMIN',
  SUPPORT = 'SUPPORT',
}

@Schema({ timestamps: true })
export class User {
  @Prop({ type: Object, select: false })
  checkoutProfile?: CheckoutProfileDto;

  @Prop({ type: String, select: false })
  mercadoPagoCustomerId?: string;

  @Prop({ type: Object, select: false })
  defaultCard?: { id: string; lastFour: string; brand: string; savedAt: string };

  _id!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email!: string;

  @Prop({ required: true, select: false })
  password!: string;

  @Prop({ enum: UserRole, default: UserRole.CUSTOMER })
  role!: UserRole;

  @Prop({ default: true })
  active!: boolean;
}

export const UserSchema = SchemaFactory.createForClass(User);
