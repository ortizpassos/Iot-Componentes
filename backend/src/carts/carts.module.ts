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
@Schema({ _id: false })
export class SavedCartItem {
  @Prop({ required: true }) productId!: string;
  @Prop({ required: true, min: 1, max: 10000 }) quantity!: number;
  @Prop({ required: true, enum: ProgrammingType }) type!: ProgrammingType;
  @Prop({ default: '', maxlength: 10000 }) requirements!: string;
  @Prop({ required: true }) name!: string;
  @Prop({ required: true, min: 0 }) price!: number;
}
const SavedCartItemSchema = SchemaFactory.createForClass(SavedCartItem);
@Schema({ timestamps: true })
export class SavedCart {
  @Prop({ type: Types.ObjectId, ref: User.name, required: true, unique: true }) customer!: Types.ObjectId;
  @Prop({ type: [SavedCartItemSchema], default: [] }) items!: (CartItemDto & { name: string; price: number })[];
  @Prop({ required: true }) lastActivityAt!: Date;
  @Prop({ type: Date }) reminderSentAt?: Date;
}
export const SavedCartSchema = SchemaFactory.createForClass(SavedCart);
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
    const update = { $set: { items, lastActivityAt: new Date() } };
    try {
      await this.carts.updateOne({ customer }, update, { upsert: true, runValidators: true });
    } catch (error) {
      // Two browser writes can reach the API before the first upsert finishes.
      // The unique customer index keeps one cart; retry the losing write as an update.
      if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 11000) throw error;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const result = await this.carts.updateOne({ customer }, update, { runValidators: true });
          if (result.matchedCount) return { saved: true };
        } catch (retryError) {
          if (!retryError || typeof retryError !== 'object' || !('code' in retryError) || retryError.code !== 11000) throw retryError;
        }
      }
      throw error;
    }
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
