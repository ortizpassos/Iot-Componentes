import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ProductsService } from '../products/products.service';
import { InstallmentFeePayer } from '../products/schemas/product.schema';
import { UsersService } from '../users/users.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { Order, OrderDocument, OrderItem, OrderStatus, ProgrammingType } from './schemas/order.schema';

@Injectable()
export class OrdersService {
  constructor(
    @InjectModel(Order.name) private readonly orderModel: Model<OrderDocument>,
    private readonly productsService: ProductsService,
    private readonly usersService: UsersService,
  ) {}

  async create(customerId: string, dto: CreateOrderDto) {
    const checkoutProfile = await this.usersService.requireCheckoutProfile(customerId);
    const ids = dto.items.map(item => item.productId.toLowerCase());
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException('Informe cada produto uma única vez no pedido.');
    }

    const items: OrderItem[] = [];
    let totalCents = 0;
    for (const input of dto.items) {
      const product = await this.productsService.findById(input.productId);
      if (!product.active) throw new BadRequestException('Produto inativo.');
      const request = input.programmingRequest;
      const requested = request?.requested ?? false;
      const type = request?.type ?? ProgrammingType.NONE;
      const requirements = request?.requirements?.trim();
      if (requested !== (type !== ProgrammingType.NONE) || (!requested && requirements)) {
        throw new BadRequestException('Solicitação de programação inconsistente.');
      }
      if (requested && !product.programming?.supported) {
        throw new BadRequestException('Produto não suporta programação.');
      }
      if ((type === ProgrammingType.AI || type === ProgrammingType.CUSTOM) && !requirements) {
        throw new BadRequestException('Descreva os requisitos da programação solicitada.');
      }

      // Compute using integer cents; never accept prices or totals from the client.
      const unitCents = Math.round((product.price + Number.EPSILON) * 100);
      const itemCents = unitCents * input.quantity;
      totalCents += itemCents;
      if (unitCents < 0 || !Number.isSafeInteger(unitCents) || !Number.isSafeInteger(itemCents) || !Number.isSafeInteger(totalCents)) {
        throw new BadRequestException('Valor do pedido fora do limite suportado.');
      }
      items.push({
        productId: new Types.ObjectId(input.productId),
        sku: product.sku,
        name: product.name,
        installmentFeePayer: product.installmentFeePayer || InstallmentFeePayer.BUYER,
        quantity: input.quantity,
        unitPrice: unitCents / 100,
        total: itemCents / 100,
        programmingRequest: { requested, type, ...(requirements ? { requirements } : {}) },
      });
    }

    return this.orderModel.create({
      customer: new Types.ObjectId(customerId),
      checkoutProfile,
      status: OrderStatus.PENDING,
      items,
      total: totalCents / 100,
    });
  }

  findAll(customerId: string) {
    return this.orderModel.find({ customer: customerId }).sort({ createdAt: -1 }).lean();
  }

  async findOne(customerId: string, id: string) {
    if (!Types.ObjectId.isValid(id)) throw new BadRequestException('ID de pedido inválido.');
    const order = await this.orderModel.findOne({ _id: id, customer: customerId }).lean();
    if (!order) throw new NotFoundException('Pedido não encontrado.');
    return order;
  }
}
