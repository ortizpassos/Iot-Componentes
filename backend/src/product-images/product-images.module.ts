import {
  BadRequestException, Controller, FileTypeValidator, Get, Header, Inject, Injectable,
  Module, NotFoundException, Param, PayloadTooLargeException, Post, StreamableFile,
  UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { AdminGuard } from '../common/guards/admin.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PRODUCT_IMAGE_FILENAME } from '../products/image-url.validator';

export const IMAGE_DIRECTORY = Symbol('IMAGE_DIRECTORY');
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
interface UploadedImage { buffer: Buffer; size: number; mimetype: string }
const extensions: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

@Injectable()
export class ProductImagesService {
  constructor(@Inject(IMAGE_DIRECTORY) private readonly directory: string) {}
  async upload(file?: UploadedImage) {
    if (!file?.buffer?.length) throw new BadRequestException('Selecione uma imagem.');
    if (file.buffer.length > MAX_IMAGE_BYTES) throw new PayloadTooLargeException('A imagem deve ter no máximo 5 MB.');
    const validator = new FileTypeValidator({ fileType: /^image\/(jpeg|png|webp)$/, overrideMimeType: true });
    if (!await validator.isValid(file)) throw new BadRequestException('Envie uma imagem JPG, PNG ou WebP válida.');
    const filename = `${randomUUID()}.${extensions[file.mimetype]}`;
    await mkdir(this.directory, { recursive: true });
    await writeFile(join(this.directory, filename), file.buffer, { flag: 'wx' });
    return { imageUrl: `/api/product-images/${filename}` };
  }
  async read(filename: string) {
    if (!PRODUCT_IMAGE_FILENAME.test(filename)) throw new NotFoundException('Imagem não encontrada.');
    try {
      const buffer = await readFile(join(this.directory, filename));
      const ext = filename.split('.').pop();
      const type = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
      return new StreamableFile(buffer, { type, length: buffer.length, disposition: 'inline' });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new NotFoundException('Imagem não encontrada.');
      throw error;
    }
  }
}
@Controller('admin/product-images')
@UseGuards(JwtAuthGuard, AdminGuard)
export class ProductImagesUploadController {
  constructor(private readonly images: ProductImagesService) {}
  @Post()
  @UseInterceptors(FileInterceptor('image', { limits: { fileSize: MAX_IMAGE_BYTES, files: 1, fields: 0, parts: 2 } }))
  upload(@UploadedFile() file?: UploadedImage) { return this.images.upload(file); }
}
@Controller('product-images')
export class ProductImagesController {
  constructor(private readonly images: ProductImagesService) {}
  @Get(':filename')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  read(@Param('filename') filename: string) { return this.images.read(filename); }
}
@Module({
  controllers: [ProductImagesUploadController, ProductImagesController],
  providers: [ProductImagesService, { provide: IMAGE_DIRECTORY, useValue: resolve(__dirname, '../../uploads/products') }],
})
export class ProductImagesModule {}
