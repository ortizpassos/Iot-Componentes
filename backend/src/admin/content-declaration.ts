import { CheckoutProfileDto } from '../users/checkout-profile.dto';
import type { ShippingSender } from './shipping-label';

export interface DeclarationItem { name: string; quantity: number; total: number }
export function contentDeclaration(doc: PDFKit.PDFDocument, id: string, recipient: CheckoutProfileDto, sender: ShippingSender, items: DeclarationItem[]) {
  const money = (value: number) => value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const clean = (value: string) => value.replace(/[\r\n\t]+/g, ' ').trim();
  const left = 30, width = 535.28;
  const cell = (text: string, x: number, y: number, w: number, h: number, bold = false, align: 'left' | 'center' | 'right' = 'left') => {
    doc.lineWidth(.6).rect(x, y, w, h).stroke();
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9).text(text, x + 6, y + 5, { width: w - 12, height: h - 7, align });
  };
  let page = 0;
  const header = () => {
    const top = page === 0 ? 430 : 30;
    if (page > 0) doc.addPage({ size: 'A4', margin: 30 });
    page++;
    cell('DECLARAÇÃO DE CONTEÚDO', left, top, width, 24, true, 'center');
    const person = (p: ShippingSender, cpf: string, x: number) => {
      const a = p.address;
      const lines = [
        `Nome: ${clean(p.fullName)}`,
        `Endereço: ${clean(a.street)}, ${a.number}${a.complement ? ' - ' + clean(a.complement) : ''} - ${clean(a.neighborhood)}`,
        `Cidade: ${clean(a.city)} / UF: ${a.state}`,
        `CEP: ${a.zipCode.slice(0, 5)}-${a.zipCode.slice(5)}    CPF/CNPJ: ${cpf || '____________________'}`,
      ];
      const text = lines.join('\n');
      let size = 9;
      while (size > 6 && doc.font('Helvetica').fontSize(size).heightOfString(text, { width: width / 2 - 12, lineGap: 2 }) > 92) size -= .5;
      doc.rect(x, top + 46, width / 2, 108).stroke();
      doc.font('Helvetica').fontSize(size).text(text, x + 6, top + 52, { width: width / 2 - 12, lineGap: 2 });
    };
    cell('Remetente', left, top + 24, width / 2, 22, true);
    cell('Destinatário', left + width / 2, top + 24, width / 2, 22, true);
    person(sender, '', left); person(recipient, recipient.cpf, left + width / 2);
    cell('Identificação dos bens', left, top + 154, width, 22, true, 'center');
    cell('Item', left, top + 176, 40, 22, true);
    cell('Conteúdo', left + 40, top + 176, 295.28, 22, true);
    cell('Quantidade', left + 335.28, top + 176, 90, 22, true);
    cell('Valor (R$)', left + 425.28, top + 176, 110, 22, true);
    doc.font('Helvetica').fontSize(8).text(`Pedido ${id} · Declaração ${page}`, left, 795, { width });
    return top + 198;
  };
  let y = header();
  items.forEach((item, index) => {
    const name = clean(item.name);
    doc.font('Helvetica').fontSize(9);
    const height = Math.max(22, doc.heightOfString(name, { width: 283.28 }) + 12);
    if (y + height > 738) y = header();
    cell(String(index + 1).padStart(2, '0'), left, y, 40, height);
    cell(name, left + 40, y, 295.28, height);
    cell(String(item.quantity), left + 335.28, y, 90, height, false, 'center');
    cell(money(item.total), left + 425.28, y, 110, height, false, 'right');
    y += height;
  });
  if (y + 44 > 790) y = header();
  cell('TOTAIS', left, y, 335.28, 22, true);
  cell(String(items.reduce((sum, item) => sum + item.quantity, 0)), left + 335.28, y, 90, 22, true, 'center');
  cell(money(items.reduce((sum, item) => sum + Math.round(item.total * 100), 0) / 100), left + 425.28, y, 110, 22, true, 'right');
  cell('PESO TOTAL (Kg)', left, y + 22, 335.28, 22, true);
  cell('____________________', left + 335.28, y + 22, 200, 22);
}
