import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomInt } from 'node:crypto';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { EmailVerificationService } from '../notifications/email-verification.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly verificationEmail?: EmailVerificationService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) throw new ConflictException('E-mail já cadastrado.');

    const password = await bcrypt.hash(dto.password, 12);
    const code = this.newCode();
    const user = await this.usersService.create({
      name: dto.name.trim(),
      email: dto.email.trim().toLowerCase(),
      password,
      active: false,
      emailVerificationCodeHash: this.hashCode(code),
      emailVerificationExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
    });
    if (!this.verificationEmail) throw new ConflictException('A confirmação de e-mail não está configurada.');
    await this.verificationEmail.send(user.email, user.name, code);
    return { message: 'Conta criada. Enviamos um código de confirmação para seu e-mail.', email: user.email };
  }

  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmail(dto.email);

    if (user && !user.active) throw new UnauthorizedException('Confirme seu e-mail com o código enviado antes de entrar.');
    if (!user || !(await bcrypt.compare(dto.password, user.password))) {
      throw new UnauthorizedException('E-mail ou senha inválidos.');
    }

    return this.createLoginResponse(user);
  }

  async verifyEmail(dto: VerifyEmailDto) {
    const user = await this.usersService.findByVerificationEmail(dto.email);
    if (!user || user.active || !user.emailVerificationCodeHash || !user.emailVerificationExpiresAt || user.emailVerificationExpiresAt.getTime() < Date.now() || this.hashCode(dto.code) !== user.emailVerificationCodeHash) {
      throw new UnauthorizedException('Código de confirmação inválido ou expirado.');
    }
    const verified = await this.usersService.activateEmail(String(user._id));
    if (!verified) throw new UnauthorizedException('Não foi possível confirmar o e-mail.');
    return this.createLoginResponse(verified);
  }

  async resendVerification(email: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user || user.active) return { message: 'Se a conta existir e ainda não estiver confirmada, um novo código será enviado.' };
    if (!this.verificationEmail) throw new ConflictException('A confirmação de e-mail não está configurada.');
    const code = this.newCode();
    await this.usersService.updateVerificationCode(String(user._id), this.hashCode(code), new Date(Date.now() + 15 * 60 * 1000));
    await this.verificationEmail.send(user.email, user.name, code);
    return { message: 'Se a conta existir e ainda não estiver confirmada, um novo código será enviado.' };
  }

  private newCode() { return String(randomInt(100000, 1000000)); }
  private hashCode(code: string) { return createHash('sha256').update(code).digest('hex'); }

  private async createLoginResponse(user: any) {
    const payload = {
      sub: user._id.toString(),
      email: user.email,
      role: user.role,
    };

    return {
      accessToken: await this.jwtService.signAsync(payload),
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    };
  }
}
