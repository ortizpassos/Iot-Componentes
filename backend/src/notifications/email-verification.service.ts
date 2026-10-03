import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailVerificationService {
  constructor(private readonly config: ConfigService) {}

  async send(email: string, name: string, code: string) {
    const host = this.config.get<string>('SMTP_HOST');
    const from = this.config.get<string>('SMTP_FROM') || this.config.get<string>('SMTP_USER');
    if (!host || !from) throw new Error('SMTP de verificacao nao configurado');
    const transporter = nodemailer.createTransport({
      host,
      port: Number(this.config.get<string>('SMTP_PORT') || 587),
      secure: this.config.get<string>('SMTP_SECURE') === 'true',
      auth: this.config.get<string>('SMTP_USER') ? { user: this.config.get<string>('SMTP_USER'), pass: this.config.get<string>('SMTP_PASSWORD') } : undefined,
    });
    await transporter.sendMail({
      from,
      to: email,
      subject: 'Confirme seu e-mail - IOT-Componentes',
      text: `Ola, ${name}!\n\nSeu codigo de confirmacao e: ${code}\n\nEle expira em 15 minutos.`,
      html: `<p>Ola, ${this.escape(name)}!</p><p>Seu codigo de confirmacao e:</p><p style="font-size:28px;font-weight:700;letter-spacing:4px">${code}</p><p>Ele expira em 15 minutos.</p>`,
    });
  }

  private escape(value: string) { return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] || character); }
}
