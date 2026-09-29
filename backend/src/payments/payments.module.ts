import { Body, Controller, Delete, Get, Headers, HttpCode, Module, Param, Post, Query, UseGuards } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { MongooseModule } from '@nestjs/mongoose';
import { Order, OrderSchema } from '../orders/schemas/order.schema';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { CreatePaymentDto } from './payment.dto';
import { MercadoPagoService } from './mercado-pago.service';
import { PaymentsService } from './payments.service';
import { ProductsModule } from '../products/products.module';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService, private readonly provider: MercadoPagoService) {}
  @Get('config') @UseGuards(JwtAuthGuard) config() { return this.provider.configuration(); }
  @Get('saved-card') @UseGuards(JwtAuthGuard)
  savedCard(@CurrentUser() user: AuthenticatedUser) { return this.payments.savedCard(user.userId); }
  @Delete('saved-card') @UseGuards(JwtAuthGuard)
  forgetCard(@CurrentUser() user: AuthenticatedUser) { return this.payments.forgetCard(user.userId); }
  @Get(':orderId') @UseGuards(JwtAuthGuard)
  status(@CurrentUser() user: AuthenticatedUser, @Param('orderId') id: string) { return this.payments.status(user.userId, id); }
  @Post(':orderId') @UseGuards(JwtAuthGuard)
  create(@CurrentUser() user: AuthenticatedUser, @Param('orderId') id: string, @Body() dto: CreatePaymentDto) { return this.payments.create(user.userId, id, dto); }
  @Post(':orderId/change-method') @UseGuards(JwtAuthGuard)
  changeMethod(@CurrentUser() user: AuthenticatedUser, @Param('orderId') id: string) { return this.payments.changeMethod(user.userId, id); }
  @Post('notifications/mercadopago') @HttpCode(200)
  webhook(@Query('data.id') id: string, @Headers('x-request-id') requestId: string, @Headers('x-signature') signature: string) { return this.payments.webhook(id, requestId, signature); }
}
@Module({ imports: [ProductsModule, UsersModule, MongooseModule.forFeature([{ name: Order.name, schema: OrderSchema }])], controllers: [PaymentsController], providers: [PaymentsService, MercadoPagoService] })
export class PaymentsModule {}
