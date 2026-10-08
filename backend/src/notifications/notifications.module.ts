import { Controller, Get, Global, Injectable, Module, Param, Patch, UseGuards } from '@nestjs/common';
import { InjectModel, MongooseModule, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AuthenticatedUser, CurrentUser } from '../common/decorators/current-user.decorator';

@Schema({ timestamps: true })
export class Notification {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true }) customer!: Types.ObjectId;
  @Prop({ required: true, enum: ['OFFER', 'ORDER', 'SYSTEM'] }) type!: 'OFFER' | 'ORDER' | 'SYSTEM';
  @Prop({ required: true, maxlength: 160 }) title!: string;
  @Prop({ required: true, maxlength: 1000 }) message!: string;
  @Prop({ maxlength: 300 }) link?: string;
  @Prop({ type: Date }) readAt?: Date;
}
const NotificationSchema = SchemaFactory.createForClass(Notification);
NotificationSchema.index({ customer: 1, createdAt: -1 });

@Injectable()
export class NotificationsService {
  constructor(@InjectModel(Notification.name) private readonly notifications: Model<Notification>) {}

  create(customer: string, data: Pick<Notification, 'type' | 'title' | 'message' | 'link'>) {
    return this.notifications.create({ ...data, customer: new Types.ObjectId(customer) });
  }

  async list(customer: string) {
    const filter = { customer: new Types.ObjectId(customer) };
    const [items, unread] = await Promise.all([
      this.notifications.find(filter).sort({ createdAt: -1 }).limit(50).lean(),
      this.notifications.countDocuments({ ...filter, readAt: { $exists: false } }),
    ]);
    return { items, unread };
  }

  async read(customer: string, id: string) {
    if (!Types.ObjectId.isValid(id)) return { read: false };
    const result = await this.notifications.updateOne({ _id: id, customer: new Types.ObjectId(customer) }, { $set: { readAt: new Date() } });
    return { read: !!result.matchedCount };
  }
}

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}
  @Get() list(@CurrentUser() user: AuthenticatedUser) { return this.service.list(user.userId); }
  @Patch(':id/read') read(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.service.read(user.userId, id); }
}

@Global()
@Module({ imports: [MongooseModule.forFeature([{ name: Notification.name, schema: NotificationSchema }])], controllers: [NotificationsController], providers: [NotificationsService], exports: [NotificationsService] })
export class NotificationsModule {}
