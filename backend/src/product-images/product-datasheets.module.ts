import { BadRequestException, Controller, Get, Header, Inject, Injectable, Module, NotFoundException, Param, PayloadTooLargeException, Post, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { AdminGuard } from '../common/guards/admin.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

export const DATASHEET_DIRECTORY = Symbol('DATASHEET_DIRECTORY');
export const MAX_PDF_BYTES = 10 * 1024 * 1024;
interface UploadedPdf { buffer: Buffer; mimetype: string }
@Injectable()
export class ProductDatasheetsService {
  constructor(@Inject(DATASHEET_DIRECTORY) private readonly directory: string) {}
  async upload(file?: UploadedPdf) {
    if (!file?.buffer?.length) throw new BadRequestException('Selecione um datasheet PDF.');
    if (file.buffer.length > MAX_PDF_BYTES) throw new PayloadTooLargeException('O PDF deve ter no máximo 10 MB.');
    if (file.mimetype !== 'application/pdf' || !/^%PDF-1\.[0-9]|^%PDF-2\.0/.test(file.buffer.subarray(0, 8).toString('ascii')) || !file.buffer.subarray(-1024).includes(Buffer.from('%%EOF'))) {
      throw new BadRequestException('Envie um arquivo PDF válido.');
    }
    const filename = `${randomUUID()}.pdf`;
    await mkdir(this.directory, { recursive: true });
    await writeFile(join(this.directory, filename), file.buffer, { flag: 'wx' });
    return { datasheetUrl: `/api/product-datasheets/${filename}` };
  }
  async read(filename: string) {
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.pdf$/.test(filename)) throw new NotFoundException('Datasheet não encontrado.');
    try {
      const buffer = await readFile(join(this.directory, filename));
      return new StreamableFile(buffer, { type: 'application/pdf', length: buffer.length, disposition: 'attachment; filename="datasheet.pdf"' });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new NotFoundException('Datasheet não encontrado.');
      throw error;
    }
  }
}
@Controller('admin/product-datasheets')
@UseGuards(JwtAuthGuard, AdminGuard)
export class ProductDatasheetsUploadController {
  constructor(private readonly files: ProductDatasheetsService) {}
  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_PDF_BYTES, files: 1, fields: 0, parts: 2 } }))
  upload(@UploadedFile() file?: UploadedPdf) { return this.files.upload(file); }
}
@Controller('product-datasheets')
export class ProductDatasheetsController {
  constructor(private readonly files: ProductDatasheetsService) {}
  @Get(':filename')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Content-Security-Policy', 'sandbox')
  read(@Param('filename') filename: string) { return this.files.read(filename); }
}
@Module({ controllers: [ProductDatasheetsUploadController, ProductDatasheetsController], providers: [ProductDatasheetsService, { provide: DATASHEET_DIRECTORY, useValue: resolve(__dirname, '../../uploads/datasheets') }] })
export class ProductDatasheetsModule {}
