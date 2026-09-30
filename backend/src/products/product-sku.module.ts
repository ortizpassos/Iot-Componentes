import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Product, ProductSchema } from './schemas/product.schema';
import { ProductSkuCounter, ProductSkuCounterSchema } from './schemas/product-sku-counter.schema';
import { ProductSkuService } from './product-sku.service';

@Module({
  imports: [MongooseModule.forFeature([
    { name: Product.name, schema: ProductSchema },
    { name: ProductSkuCounter.name, schema: ProductSkuCounterSchema },
  ])],
  providers: [ProductSkuService],
  exports: [ProductSkuService],
})
export class ProductSkuModule {}