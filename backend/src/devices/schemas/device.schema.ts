import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type DeviceDocument = HydratedDocument<Device>;

@Schema({ timestamps: true })
export class Device {
  _id!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  owner!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ required: true, trim: true })
  board!: string;

  @Prop()
  model?: string;

  @Prop({ unique: true, sparse: true })
  serialNumber?: string;

  @Prop()
  macAddress?: string;

  @Prop({ default: false })
  online!: boolean;

  @Prop({ type: Object, default: {} })
  hardware!: Record<string, unknown>;

  @Prop({ type: Types.ObjectId, ref: 'Firmware' })
  currentFirmwareId?: Types.ObjectId;
}

export const DeviceSchema = SchemaFactory.createForClass(Device);
