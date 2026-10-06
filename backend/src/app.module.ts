import { ProjectStoreModule } from './project-store/project-store.module';
import { CartsModule } from './carts/carts.module';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { DevicesModule } from './devices/devices.module';
import { ProjectsModule } from './projects/projects.module';
import { HealthController } from './health.controller';
import { ProductsModule } from './products/products.module';
import { OrdersModule } from './orders/orders.module';
import { AdminModule } from './admin/admin.module';
import { SettingsModule } from './settings/settings.module';
import { ProductImagesModule } from './product-images/product-images.module';
import { PaymentsModule } from './payments/payments.module';
import { ProductDatasheetsModule } from './product-images/product-datasheets.module';
import { ShippingModule } from './shipping/shipping.module';
import { EmailEventsModule } from './email/email-events.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.getOrThrow<string>('MONGODB_URI'),
      }),
    }),
    CartsModule,
    EmailEventsModule,
    AuthModule,
    UsersModule,
    DevicesModule,
    ProjectsModule,
    ProjectStoreModule,
    ProductsModule,
    OrdersModule,
    AdminModule,
    SettingsModule,
    ProductImagesModule,
    ProductDatasheetsModule,
    PaymentsModule,
    ShippingModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
