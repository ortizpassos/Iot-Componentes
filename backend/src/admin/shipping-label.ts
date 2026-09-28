import PDFDocument = require('pdfkit');
import { BadRequestException } from '@nestjs/common';
import { plainToInstance, Transform } from 'class-transformer';
import { IsDefined, IsNotEmpty, IsString, MaxLength, ValidateNested, validateSync } from 'class-validator';
import { Type } from 'class-transformer';
import { toBuffer } from 'bwip-js';
import { AddressDto, CheckoutProfileDto } from '../users/checkout-profile.dto';

export class ShippingSender {
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @IsNotEmpty() @MaxLength(150) fullName!: string;
  @IsDefined() @ValidateNested() @Type(() => AddressDto) address!: AddressDto;
}
export async function shippingLabel(id: string, profile: CheckoutProfileDto | undefined, sender?: ShippingSender): Promise<Buffer> {
  if (!profile || validateSync(plainToInstance(CheckoutProfileDto, profile)).length) {
    throw new BadRequestException('O pedido não possui dados de entrega completos. Confira nome, CPF e endereço antes do envio.');
  }
  if (!sender || validateSync(plainToInstance(ShippingSender, sender)).length) throw new BadRequestException('Cadastre os dados da loja em ADM → Configurações → Remetente das etiquetas antes de gerar a etiqueta.');
  const barcode = await toBuffer({ bcid: 'code128', text: profile.address.zipCode, scale: 3, height: 16, includetext: false, paddingwidth: 12, backgroundcolor: 'FFFFFF' });
  const doc = new PDFDocument({ size: [283.46, 425.2], margin: 14, bufferPages: true, info: { Title: `Etiqueta de envio - ${id}` } });
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
    const width = 227;
    let size = 10;
    const height = () => doc.font('Helvetica-Bold').fontSize(size).heightOfString(name, { width }) + 4 + doc.font('Helvetica').fontSize(size).heightOfString(address, { width, lineGap: 2 });
    while (size > 6 && height() > available) size -= .5;
    doc.font('Helvetica-Bold').fontSize(size).text(name, 28, top, { width });
    doc.moveDown(.3).font('Helvetica').text(address, { width, lineGap: 2 });
  };
  doc.lineWidth(.6).rect(14, 18, 255.46, 228).stroke();
  doc.font('Helvetica-Bold').fontSize(15).text('DESTINATÁRIO', 28, 36);
  drawAddress(profile, 66, 108);
  doc.image(barcode, 66, 182, { width: 151, height: 40 });
  doc.font('Helvetica').fontSize(9).text(zip(profile.address.zipCode), 28, 228, { width: 227, align: 'center' });
  doc.rect(14, 266, 255.46, 138).stroke();
  doc.font('Helvetica-Bold').fontSize(15).text('REMETENTE', 28, 284);
  drawAddress(sender, 313, 77);
  doc.end();
  return output;
}
