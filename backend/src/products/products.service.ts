import { PackagingService } from '../packaging/packaging.module';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateProductDto } from './dto/create-product.dto';
import { Product, ProductDocument } from './schemas/product.schema';
import { ProductSkuService } from './product-sku.service';

@Injectable()
export class ProductsService {
  constructor(
    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,
    private readonly productSkuService: ProductSkuService,
    private readonly packaging: PackagingService,
  ) {}

  async create(dto: CreateProductDto) {
    try {
      if (dto.packagingId) dto = { ...dto, ...await this.packaging.dimensions(dto.packagingId) };
      const data = dto.sku ? dto : { ...dto, sku: await this.productSkuService.next(dto.type) };
      return await this.productModel.create(data);
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 11000) {
        throw new ConflictException('SKU já cadastrado.');
      }
      throw error;
    }
  }

  findAll() {
    return this.productModel.find({ active: true }).sort({ name: 1 }).lean();
  }

  async findById(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('ID de produto inválido.');
    }
    const product = await this.productModel.findById(id).lean();
    if (!product) throw new NotFoundException('Produto não encontrado.');
    return product;
  }

  reserveStock(id: string, quantity: number) {
    return this.productModel.findOneAndUpdate(
      { _id: id, active: true, stock: { $gte: quantity } },
      { $inc: { stock: -quantity } },
      { new: true, runValidators: true },
    ).lean();
  }

  releaseStock(items: { productId: string; quantity: number }[]) {
    return Promise.all(items.map(item => this.productModel.updateOne(
      { _id: item.productId },
      { $inc: { stock: item.quantity } },
    )));
  }
}
