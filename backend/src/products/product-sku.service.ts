import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Product, ProductDocument, ProductType } from './schemas/product.schema';
import { ProductSkuCounter, ProductSkuCounterDocument } from './schemas/product-sku-counter.schema';

@Injectable()
export class ProductSkuService {
  constructor(
    @InjectModel(Product.name) private readonly productModel: Model<ProductDocument>,
    @InjectModel(ProductSkuCounter.name) private readonly counterModel: Model<ProductSkuCounterDocument>,
  ) {}

  async next(type: ProductType) {
    for (;;) {
      const counter = await this.counterModel.findOneAndUpdate(
        { type },
        { $inc: { value: 1 } },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      ).lean();
      const sku = `${type}-${String(counter.value).padStart(6, '0')}`;
      if (!await this.productModel.exists({ sku })) return sku;
    }
  }
}