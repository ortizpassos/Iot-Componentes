import PDFDocument = require('pdfkit');
import { BadRequestException } from '@nestjs/common';
import { plainToInstance, Transform } from 'class-transformer';
import { IsDefined, IsNotEmpty, IsString, MaxLength, ValidateNested, validateSync } from 'class-validator';
import { Type } from 'class-transformer';
import { toBuffer } from 'bwip-js';
import { AddressDto, CheckoutProfileDto } from '../users/checkout-profile.dto';
import { contentDeclaration, DeclarationItem } from './content-declaration';

export class ShippingSender {
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @IsNotEmpty() @MaxLength(150) fullName!: string;
  @IsDefined() @ValidateNested() @Type(() => AddressDto) address!: AddressDto;
}
export async function shippingLabel(id: string, profile: CheckoutProfileDto | undefined, sender?: ShippingSender, items?: DeclarationItem[]): Promise<Buffer> {
  if (!items?.length || items.some(item => !item.name || item.name.length > 1000 || !Number.isInteger(item.quantity) || item.quantity < 1 || !Number.isFinite(item.total) || item.total < 0)) throw new BadRequestException('O pedido não possui itens válidos para a declaração de conteúdo.');
  if (!profile || validateSync(plainToInstance(CheckoutProfileDto, profile)).length) {
    throw new BadRequestException('O pedido não possui dados de entrega completos. Confira nome, CPF e endereço antes do envio.');
  }
  if (!sender || validateSync(plainToInstance(ShippingSender, sender)).length) throw new BadRequestException('Cadastre os dados da loja em ADM → Configurações → Remetente das etiquetas antes de gerar a etiqueta.');
  const barcode = await toBuffer({ bcid: 'code128', text: profile.address.zipCode, scale: 3, height: 16, includetext: false, paddingwidth: 12, backgroundcolor: 'FFFFFF' });
  const doc = new PDFDocument({ size: 'A4', margin: 24, bufferPages: true, info: { Title: `Etiqueta de envio - ${id}` } });
  const output = new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', chunk => chunks.push(chunk)); doc.on('error', reject); doc.on('end', () => resolve(Buffer.concat(chunks)));
  });
  const clean = (value: string) => value.replace(/[\r\n\t]+/g, ' ').trim();
  const zip = (value: string) => `${value.slice(0, 5)}-${value.slice(5)}`;
  const drawAddress = (person: ShippingSender, top: number, available: number) => {
    const a = person.address;
    const name = clean(person.fullName).toLocaleUpperCase('pt-BR');
    const address = [`${a.street}, ${a.number}${a.complement ? ' - ' + a.complement : ''}`, `${a.neighborhood} - ${a.city} - ${a.state}`, `CEP: ${zip(a.zipCode)}`].map(clean).join('\n');
    const width = doc.page.width - 72;
    let size = 14;
    const height = () => doc.font('Helvetica-Bold').fontSize(size).heightOfString(name, { width }) + 4 + doc.font('Helvetica').fontSize(size).heightOfString(address, { width, lineGap: 2 });
    while (size > 6 && height() > available) size -= .5;
    doc.font('Helvetica-Bold').fontSize(size).text(name, 36, top, { width });
    doc.moveDown(.3).font('Helvetica').text(address, { width, lineGap: 2 });
  };
  // Half of an A4 portrait sheet, with 24 pt print margins.
  const boxWidth = doc.page.width - 48;
  doc.lineWidth(.8).rect(24, 24, boxWidth, 224).stroke();
  doc.font('Helvetica-Bold').fontSize(20).text('DESTINATÁRIO', 36, 38);
  drawAddress(profile, 70, 100);
  doc.image(barcode, (doc.page.width - 220) / 2, 180, { width: 220, height: 43 });
  doc.font('Helvetica').fontSize(12).text(zip(profile.address.zipCode), 36, 228, { width: doc.page.width - 72, align: 'center' });
  doc.rect(24, 260, boxWidth, doc.page.height / 2 - 284).stroke();
  doc.font('Helvetica-Bold').fontSize(20).text('REMETENTE', 36, 274);
  drawAddress(sender, 307, 78);
  contentDeclaration(doc, id, profile, sender, items);
  doc.end();
  return output;
}
