import { BadRequestException, Body, Controller, ForbiddenException, Get, Header, Injectable, Module, NotFoundException, Param, Post, Put, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { InjectModel, MongooseModule, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { FileInterceptor } from '@nestjs/platform-express';
import { Model, Types } from 'mongoose';
import { createHash } from 'node:crypto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { AuthenticatedUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { Product, ProductSchema, ProductType } from '../products/schemas/product.schema';
import { Order, OrderSchema, OrderStatus } from '../orders/schemas/order.schema';
import { PackagingModule, PackagingService } from '../packaging/packaging.module';
import { StoreProjectDto, FirmwareDto } from './project-store.dto';
@Schema({ timestamps: true })
export class ProjectAsset {
  @Prop({ required: true }) name!: string;
  @Prop({ required: true }) kind!: string;
  @Prop({ required: true }) mime!: string;
  @Prop({ required: true }) size!: number;
  @Prop({ required: true }) sha256!: string;
  @Prop({ type: Buffer, required: true, select: false }) data!: Buffer;
}
@Schema({ timestamps: true })
export class StoreProject {
  @Prop({ required: true }) name!: string;
  @Prop() description!: string;
  @Prop() instructions!: string;
  @Prop({ default: false }) active!: boolean;
  @Prop() digitalPrice!: number;
  @Prop() completeEnabled!: boolean;
  @Prop() completePrice!: number;
  @Prop() stock!: number;
  @Prop() packagingId?: string;
  @Prop() weightGrams?: number;
  @Prop({ type: [String], default: [] }) images!: string[];
  @Prop({ type: [String], default: [] }) pdfs!: string[];
  @Prop() videoUrl?: string;
  @Prop({ type: [Object], default: [] }) firmware!: FirmwareDto[];
  @Prop({ type: Types.ObjectId }) digitalProductId!: Types.ObjectId;
  @Prop({ type: Types.ObjectId }) completeProductId!: Types.ObjectId;
}
const PAID = [OrderStatus.PAID, OrderStatus.LABEL_ISSUED, OrderStatus.SHIPPED, OrderStatus.FULFILLED];
@Injectable()
export class ProjectStoreService {
  constructor(@InjectModel(StoreProject.name) private readonly projects: Model<StoreProject>, @InjectModel(ProjectAsset.name) private readonly assets: Model<ProjectAsset>, @InjectModel(Product.name) private readonly products: Model<Product>, @InjectModel(Order.name) private readonly orders: Model<Order>, private readonly packaging: PackagingService) {}
  private id(id: string) { if (!Types.ObjectId.isValid(id)) throw new BadRequestException('ID inválido.'); return id; }
  async upload(kind: string, file?: { originalname: string; mimetype: string; buffer: Buffer }) {
    if (!['bin', 'pdf', 'image'].includes(kind) || !file?.buffer?.length) throw new BadRequestException('Selecione um arquivo válido.');
    const b = file.buffer;
    if (b.length > (kind === 'image' ? 5 : 10) * 1024 * 1024) throw new BadRequestException('Arquivo muito grande. Imagens: 5 MB; PDF e BIN: 10 MB.');
    let mime = 'application/octet-stream';
    if (kind === 'bin' && !file.originalname.toLowerCase().endsWith('.bin')) throw new BadRequestException('Selecione um arquivo .bin.');
    if (kind === 'pdf') { if (!b.subarray(0, 5).equals(Buffer.from('%PDF-')) || !b.subarray(-1024).includes(Buffer.from('%%EOF'))) throw new BadRequestException('PDF inválido.'); mime = 'application/pdf'; }
    if (kind === 'image') {
      if (b.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) mime = 'image/png';
      else if (b[0] === 255 && b[1] === 216 && b[2] === 255) mime = 'image/jpeg';
      else if (b.subarray(0,4).toString() === 'RIFF' && b.subarray(8,12).toString() === 'WEBP') mime = 'image/webp';
      else throw new BadRequestException('Use JPG, PNG ou WebP.');
    }
    const asset = await this.assets.create({ name: file.originalname.replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0,150), kind, mime, size: b.length, sha256: createHash('sha256').update(b).digest('hex'), data: b });
    return { _id: asset._id, name: asset.name, kind, size: asset.size, sha256: asset.sha256 };
  }
  async save(dto: StoreProjectDto, id?: string) {
    const previous = id ? await this.projects.findById(this.id(id)).lean() : null;
    if (id && !previous) throw new NotFoundException('Projeto não encontrado.');
    if (dto.active && !dto.firmware.length) throw new BadRequestException('Cadastre um firmware antes de publicar.');
    const ids = [...dto.images, ...dto.pdfs, ...dto.firmware.flatMap(f => f.parts.map(p => p.assetId))];
    const assets = await this.assets.find({ _id: { $in: ids } }).lean();
    const asset = (id: string, kind: string) => { const a = assets.find(a => String(a._id) === id && a.kind === kind); if (!a) throw new BadRequestException('Arquivo ausente ou tipo incorreto.'); return a; };
    dto.images.forEach(id => asset(id, 'image')); dto.pdfs.forEach(id => asset(id, 'pdf'));
    for (const variant of dto.firmware) {
      if (variant.format === 'MERGED' && (variant.parts.length !== 1 || variant.parts[0].address !== 0)) throw new BadRequestException('Firmware completo deve usar um BIN no endereço 0.');
      let end = 0;
      for (const part of [...variant.parts].sort((a,b) => a.address - b.address)) {
        const size = asset(part.assetId, 'bin').size;
        if (part.address % 4096 || part.address < end || part.address + size > 32 * 1024 * 1024) throw new BadRequestException('Endereços do firmware devem ser alinhados a 4096 bytes, sem sobreposição.');
        end = Math.ceil((part.address + size) / 4096) * 4096;
      }
    }
    if (dto.completeEnabled) {
      if (!dto.weightGrams || dto.completePrice <= 0) throw new BadRequestException('Informe preço e peso do dispositivo completo.');

    }
    const projectId = previous?._id || new Types.ObjectId();
    const digitalProductId = previous?.digitalProductId || new Types.ObjectId();
    const completeProductId = previous?.completeProductId || new Types.ObjectId();
    const imageUrl = dto.images[0] ? '/api/project-store/images/' + dto.images[0] : '';
    // Offers reuse the existing order and payment pipeline; entitlements come from paid order snapshots.
    for (const digital of [true, false]) {
      await this.products.findByIdAndUpdate(digital ? digitalProductId : completeProductId, { $set: {
        name: dto.name + (digital ? ' - Projeto digital' : ' - Dispositivo gravado'), sku: 'PROJECT-' + projectId + (digital ? '-D' : '-C'), type: digital ? ProductType.SERVICE : ProductType.KIT,
        description: dto.description, price: digital ? dto.digitalPrice : dto.completePrice, stock: digital ? 1000000 : dto.stock,
        active: dto.active && (digital || dto.completeEnabled), imageUrl, programming: { supported: false },
        storeProjectId: String(projectId), deliveryKind: digital ? 'DIGITAL' : 'PHYSICAL',
        ...(digital ? {} : { weightGrams: dto.weightGrams }),
      } }, { upsert: true, runValidators: true });
    }
    return this.projects.findByIdAndUpdate(projectId, { $set: { ...dto, videoUrl: dto.videoUrl || '', digitalProductId, completeProductId } }, { upsert: true, new: true, runValidators: true }).lean();
  }
  adminList() { return this.projects.find().sort({ createdAt: -1 }).lean(); }
  async purchased(customer: string, id: string) {
    return !!await this.orders.exists({ customer, status: { $in: PAID }, 'items.storeProjectId': id });
  }
  private publicView(p: StoreProject & { _id: Types.ObjectId }) { return { _id: p._id, name: p.name, description: p.description, images: p.images, videoUrl: p.videoUrl, digitalPrice: p.digitalPrice, completePrice: p.completePrice, completeEnabled: p.completeEnabled, stock: p.stock, digitalProductId: p.digitalProductId, completeProductId: p.completeProductId, active: p.active }; }
  async catalog() { return (await this.projects.find({ active: true }).sort({ createdAt: -1 }).lean()).map(p => this.publicView(p)); }
  async mine(customer: string) {
    const orders = await this.orders.find({ customer, status: { $in: PAID }, 'items.storeProjectId': { $exists: true } }).lean();
    const ids = [...new Set(orders.flatMap(o => o.items.map(i => i.storeProjectId).filter(Boolean)))];
    return (await this.projects.find({ _id: { $in: ids } }).lean()).map(p => this.publicView(p));
  }
  async details(user: AuthenticatedUser, id: string) {
    const project = await this.projects.findById(this.id(id)).lean();
    if (!project) throw new NotFoundException('Projeto não encontrado.');
    const owned = user.role === 'ADMIN' || await this.purchased(user.userId, id);
    if (!project.active && !owned) throw new NotFoundException('Projeto indisponível.');
    if (!owned) return { ...this.publicView(project), owned: false };
    const ids = [...project.pdfs, ...project.firmware.flatMap(f => f.parts.map(p => p.assetId))];
    const assets = await this.assets.find({ _id: { $in: ids } }).lean();
    return { ...this.publicView(project), owned: true, instructions: project.instructions, firmware: project.firmware, assets: assets.map(a => ({ _id: a._id, name: a.name, size: a.size, sha256: a.sha256, kind: a.kind })) };
  }
  async read(user: AuthenticatedUser | null, projectId: string | null, assetId: string) {
    if (projectId) {
      const p = await this.projects.findById(this.id(projectId)).lean();
      if (!p || ![...p.pdfs, ...p.firmware.flatMap(f => f.parts.map(p => p.assetId))].includes(assetId)) throw new NotFoundException('Arquivo não encontrado.');
      if (!user || (user.role !== 'ADMIN' && !await this.purchased(user.userId, projectId))) throw new ForbiddenException('Arquivo liberado após pagamento.');
    }
    const asset = await this.assets.findById(this.id(assetId)).select('+data').lean();
    if (!asset || (!projectId && asset.kind !== 'image')) throw new NotFoundException('Arquivo não encontrado.');
    const bytes = Buffer.isBuffer(asset.data) ? asset.data : Buffer.from(asset.data.value());
    return new StreamableFile(bytes, { type: asset.mime, length: asset.size, disposition: (asset.kind === 'image' ? 'inline' : 'attachment') + '; filename="' + asset.name + '"' });
  }
}
@Controller('admin/project-store') @UseGuards(JwtAuthGuard, AdminGuard)
export class ProjectStoreAdminController {
  constructor(private readonly store: ProjectStoreService) {}
  @Get() list() { return this.store.adminList(); }
  @Post() create(@Body() dto: StoreProjectDto) { return this.store.save(dto); }
  @Put(':id') update(@Param('id') id: string, @Body() dto: StoreProjectDto) { return this.store.save(dto, id); }
  @Post('assets/:kind') @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 0 } }))
  upload(@Param('kind') kind: string, @UploadedFile() file: any) { return this.store.upload(kind, file); }
}
@Controller('project-store') @UseGuards(JwtAuthGuard)
export class ProjectStoreController {
  constructor(private readonly store: ProjectStoreService) {}
  @Get() catalog() { return this.store.catalog(); }
  @Get('mine') mine(@CurrentUser() user: AuthenticatedUser) { return this.store.mine(user.userId); }
  @Get(':id') details(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.store.details(user, id); }
  @Get(':id/assets/:assetId') @Header('Cache-Control', 'private, no-store') @Header('X-Content-Type-Options', 'nosniff') @Header('Content-Security-Policy', 'sandbox')
  read(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Param('assetId') assetId: string) { return this.store.read(user, id, assetId); }
}
@Controller('project-store/images')
export class ProjectStoreImagesController {
  constructor(private readonly store: ProjectStoreService) {}
  @Get(':id') @Header('X-Content-Type-Options', 'nosniff') read(@Param('id') id: string) { return this.store.read(null, null, id); }
}
@Module({ imports: [PackagingModule, MongooseModule.forFeature([{ name: StoreProject.name, schema: SchemaFactory.createForClass(StoreProject) }, { name: ProjectAsset.name, schema: SchemaFactory.createForClass(ProjectAsset) }, { name: Product.name, schema: ProductSchema }, { name: Order.name, schema: OrderSchema }])], controllers: [ProjectStoreAdminController, ProjectStoreImagesController, ProjectStoreController], providers: [ProjectStoreService] })
export class ProjectStoreModule {}
