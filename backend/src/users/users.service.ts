import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CheckoutProfileDto } from './checkout-profile.dto';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';

@Injectable()
export class UsersService {
  async checkout(id: string) {
    const user = await this.userModel.findById(id).select('+checkoutProfile +mercadoPagoCustomerId +defaultCard');
    if (!user) throw new NotFoundException('Usuário não encontrado.');
    return user;
  }
  async requireCheckoutProfile(id: string) {
    const user = await this.checkout(id);
    if (!user.checkoutProfile) throw new ConflictException('Complete seu nome, CPF e endereço de entrega antes de comprar.');
    return user.checkoutProfile;
  }
  async saveCheckoutProfile(id: string, profile: CheckoutProfileDto) {
    const user = await this.userModel.findByIdAndUpdate(id, { $set: { checkoutProfile: profile, name: profile.fullName } }, { new: true }).select('+checkoutProfile');
    if (!user) throw new NotFoundException('Usuário não encontrado.');
    return { profile: user.checkoutProfile };
  }
  async linkPaymentCustomer(id: string, customerId: string) {
    await this.userModel.updateOne({ _id: id, mercadoPagoCustomerId: { $exists: false } }, { $set: { mercadoPagoCustomerId: customerId } });
    return (await this.checkout(id)).mercadoPagoCustomerId!;
  }
  async saveDefaultCard(id: string, card: { id: string; lastFour: string; brand: string; savedAt: string }) {
    await this.userModel.updateOne({ _id: id }, { $set: { defaultCard: card } });
  }
  async forgetDefaultCard(id: string) {
    await this.userModel.updateOne({ _id: id }, { $unset: { defaultCard: 1 } });
    return { removed: true };
  }
  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  create(data: { name: string; email: string; password: string }) {
    return this.userModel.create(data);
  }

  findByEmail(email: string) {
    return this.userModel
      .findOne({ email: email.toLowerCase() })
      .select('+password');
  }

  findById(id: string) {
    return this.userModel.findById(id).select('-password');
  }
}
