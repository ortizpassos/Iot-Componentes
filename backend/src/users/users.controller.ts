import { Body, Controller, Get, Put, NotFoundException, UseGuards } from '@nestjs/common';
import { CheckoutProfileDto } from './checkout-profile.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  @UseGuards(JwtAuthGuard) @Get('me/checkout-profile')
  async checkout(@CurrentUser() user: AuthenticatedUser) { return { profile: (await this.usersService.checkout(user.userId)).checkoutProfile || null }; }
  @UseGuards(JwtAuthGuard) @Put('me/checkout-profile')
  saveCheckout(@CurrentUser() user: AuthenticatedUser, @Body() dto: CheckoutProfileDto) { return this.usersService.saveCheckoutProfile(user.userId, dto); }
  constructor(private readonly usersService: UsersService) {}

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@CurrentUser() currentUser: AuthenticatedUser) {
    const user = await this.usersService.findById(currentUser.userId);
    if (!user) throw new NotFoundException('Usuário não encontrado.');
    return user;
  }
}
