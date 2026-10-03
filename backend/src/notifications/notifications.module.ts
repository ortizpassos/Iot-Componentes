import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersModule } from '../users/users.module';
import { Order, OrderSchema } from '../orders/schemas/order.schema';
import { OrderEmailService } from './order-email.service';
import { EmailVerificationService } from './email-verification.service';

@Module({
  imports: [ConfigModule, UsersModule, MongooseModule.forFeature([{ name: Order.name, schema: OrderSchema }])],
  providers: [OrderEmailService, EmailVerificationService],
  exports: [OrderEmailService, EmailVerificationService],
})
export class NotificationsModule {}
