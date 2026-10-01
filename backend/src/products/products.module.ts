import { PackagingModule } from '../packaging/packaging.module';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Product, ProductSchema } from './schemas/product.schema';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { ProductSkuModule } from './product-sku.module';

@Module({
  imports: [PackagingModule, MongooseModule.forFeature([{ name: Product.name, schema: ProductSchema }]), ProductSkuModule],
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
