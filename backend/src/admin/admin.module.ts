import { PackagingModule } from '../packaging/packaging.module';
import { PrintMonitorController, PrintMonitorService, PrintMonitorGuard } from './print-monitor';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Product, ProductSchema } from '../products/schemas/product.schema';
import { Order, OrderSchema } from '../orders/schemas/order.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { Device, DeviceSchema } from '../devices/schemas/device.schema';
import { Project, ProjectSchema } from '../projects/schemas/project.schema';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { SettingsModule } from '../settings/settings.module';
import { ProductSkuModule } from '../products/product-sku.module';

@Module({
  imports: [PackagingModule, SettingsModule, ProductSkuModule, MongooseModule.forFeature([
    { name: Product.name, schema: ProductSchema }, { name: Order.name, schema: OrderSchema },
    { name: User.name, schema: UserSchema }, { name: Device.name, schema: DeviceSchema },
    { name: Project.name, schema: ProjectSchema },
  ])],
  controllers: [AdminController, PrintMonitorController], providers: [AdminService, PrintMonitorService, PrintMonitorGuard],
})
export class AdminModule {}
