import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ProjectDocument = HydratedDocument<Project>;

export enum ProjectSource {
  MANUAL = 'MANUAL',
  AI = 'AI',
  SUPPORT = 'SUPPORT',
}

export enum ProjectStatus {
  DRAFT = 'DRAFT',
  READY = 'READY',
  ARCHIVED = 'ARCHIVED',
}

@Schema({ timestamps: true })
export class Project {
  _id!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  owner!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Device', index: true })
  device?: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop()
  description?: string;

  @Prop({ type: Object, default: {} })
  configuration!: Record<string, unknown>;

  @Prop({ enum: ProjectSource, default: ProjectSource.MANUAL })
  source!: ProjectSource;

  @Prop({ enum: ProjectStatus, default: ProjectStatus.DRAFT })
  status!: ProjectStatus;
}

export const ProjectSchema = SchemaFactory.createForClass(Project);
