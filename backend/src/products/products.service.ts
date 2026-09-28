import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateProductDto } from './dto/create-product.dto';
import { Product, ProductDocument } from './schemas/product.schema';

@Injectable()
export class ProductsService {
  constructor(
    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,
  ) {}

  async create(dto: CreateProductDto) {
    try {
      return await this.productModel.create(dto);
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
}
