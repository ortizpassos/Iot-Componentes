import { BadRequestException, Body, Controller, Get, Injectable, Module, Put, Query, UseGuards } from '@nestjs/common';
import { InjectModel, MongooseModule, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsEnum, IsInt, IsMongoId, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Product, ProductSchema } from '../products/schemas/product.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { AdminListDto } from '../admin/admin.dto';
import { ProgrammingType } from '../orders/schemas/order.schema';
export class CartItemDto {
  @IsMongoId() productId!: string;
  @IsInt() @Min(1) @Max(10000) quantity!: number;
  @IsEnum(ProgrammingType) type!: ProgrammingType;
  @IsString() @MaxLength(10000) requirements!: string;
}
export class SaveCartDto {
  @IsArray() @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => CartItemDto) items!: CartItemDto[];
}
@Schema({ timestamps: true })
export class SavedCart {
  @Prop({ type: Types.ObjectId, ref: User.name, required: true, unique: true }) customer!: Types.ObjectId;
  @Prop({ type: [{ _id: false, productId: String, quantity: Number, type: String, requirements: String, name: String, price: Number }], default: [] }) items!: (CartItemDto & { name: string; price: number })[];
  @Prop({ required: true }) lastActivityAt!: Date;
}
const SavedCartSchema = SchemaFactory.createForClass(SavedCart);
SavedCartSchema.index({ lastActivityAt: 1 });
@Injectable()
export class CartsService {
  constructor(@InjectModel(SavedCart.name) private readonly carts: Model<SavedCart>, @InjectModel(Product.name) private readonly products: Model<Product>) {}
  async get(customer: string) {
    const cart = await this.carts.findOne({ customer }).lean();
    if (!cart?.items.length) return { lines: [] };
    const products = await this.products.find({ _id: { $in: cart.items.map(i => i.productId) }, active: true }).lean();
    return { lines: cart.items.flatMap(item => {
      const product = products.find(p => String(p._id) === item.productId);
      if (!product || product.stock < 1) return [];
      return [{ product, quantity: Math.min(item.quantity, product.stock), type: product.programming?.supported ? item.type : ProgrammingType.NONE, requirements: product.programming?.supported ? item.requirements : '' }];
    }) };
  }
  async save(customer: string, dto: SaveCartDto) {
    const ids = dto.items.map(i => i.productId.toLowerCase());
    if (new Set(ids).size !== ids.length) throw new BadRequestException('Produto repetido no carrinho.');
    const products = await this.products.find({ _id: { $in: ids }, active: true }).lean();
    const items = dto.items.map(item => {
      const product = products.find(p => String(p._id) === item.productId.toLowerCase());
      if (!product || product.stock < item.quantity) throw new BadRequestException('Produto indisponível ou estoque insuficiente. Atualize o carrinho.');
      return { productId: String(product._id), quantity: item.quantity, type: product.programming?.supported ? item.type : ProgrammingType.NONE, requirements: product.programming?.supported ? item.requirements : '', name: product.name, price: product.price };
    });
    await this.carts.findOneAndUpdate({ customer }, { $set: { items, lastActivityAt: new Date() } }, { upsert: true, runValidators: true });
    return { saved: true };
  }
  async abandoned(query: AdminListDto) {
    const filter = { lastActivityAt: { $lte: new Date(Date.now() - 30 * 60 * 1000) }, 'items.0': { $exists: true } };
    const [items, total] = await Promise.all([
      this.carts.find(filter).populate('customer', 'name email').sort({ lastActivityAt: -1 }).skip((query.page - 1) * query.limit).limit(query.limit).lean(),
      this.carts.countDocuments(filter),
    ]);
    return { items: items.map(cart => ({ ...cart, total: cart.items.reduce((sum, item) => sum + Math.round(item.price * 100) * item.quantity, 0) / 100 })), total, page: query.page };
  }
}
@Controller('cart') @UseGuards(JwtAuthGuard)
export class CartsController {
  constructor(private readonly carts: CartsService) {}
  @Get() get(@CurrentUser() user: AuthenticatedUser) { return this.carts.get(user.userId); }
  @Put() save(@CurrentUser() user: AuthenticatedUser, @Body() dto: SaveCartDto) { return this.carts.save(user.userId, dto); }
}
@Controller('admin/abandoned-carts') @UseGuards(JwtAuthGuard, AdminGuard)
export class AbandonedCartsController {
  constructor(private readonly carts: CartsService) {}
  @Get() list(@Query() query: AdminListDto) { return this.carts.abandoned(query); }
}
@Module({ imports: [MongooseModule.forFeature([{ name: SavedCart.name, schema: SavedCartSchema }, { name: Product.name, schema: ProductSchema }, { name: User.name, schema: UserSchema }])], controllers: [CartsController, AbandonedCartsController], providers: [CartsService] })
export class CartsModule {}
