import { BadRequestException, Body, Controller, Get, Injectable, Module, NotFoundException, Param, Post, Put, UseGuards } from '@nestjs/common';
import { InjectModel, MongooseModule, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Transform } from 'class-transformer';
import { IsInt, IsNotEmpty, IsNumber, IsString, Max, MaxLength, Min } from 'class-validator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';

export class PackagingDto {
  @IsInt() @Min(1) @Max(1000000) maxWeightGrams!: number;
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @IsNotEmpty() @MaxLength(100) name!: string;
  @IsNumber() @Min(1) @Max(200) lengthCm!: number;
  @IsNumber() @Min(1) @Max(200) widthCm!: number;
  @IsNumber() @Min(1) @Max(200) heightCm!: number;
}
@Schema({ timestamps: true })
export class Packaging {
  @Prop({ required: true, min: 1, max: 1000000 }) maxWeightGrams!: number;
  @Prop({ required: true, trim: true, maxlength: 100 }) name!: string;
  @Prop({ required: true, min: 1, max: 200 }) lengthCm!: number;
  @Prop({ required: true, min: 1, max: 200 }) widthCm!: number;
  @Prop({ required: true, min: 1, max: 200 }) heightCm!: number;
}
@Injectable()
export class PackagingService {
  constructor(@InjectModel(Packaging.name) private readonly packages: Model<Packaging>) {}
  list() { return this.packages.find().sort({ name: 1 }).lean(); }
  create(dto: PackagingDto) { return this.packages.create(dto); }
  private id(id: string) {
    if (!Types.ObjectId.isValid(id)) throw new BadRequestException('Embalagem inválida.');
    return id;
  }
  async get(id: string) {
    const result = await this.packages.findById(this.id(id)).lean();
    if (!result) throw new NotFoundException('Embalagem não encontrada.');
    return result;
  }
  async update(id: string, dto: PackagingDto) {
    const result = await this.packages.findByIdAndUpdate(this.id(id), { $set: dto }, { new: true, runValidators: true }).lean();
    if (!result) throw new NotFoundException('Embalagem não encontrada.');
    return result;
  }
  async selectForWeight(weightGrams: number) {
    if (!Number.isSafeInteger(weightGrams) || weightGrams < 1) throw new BadRequestException('Peso total inválido para frete.');
    const candidates = (await this.list()).filter(p => Number.isFinite(p.maxWeightGrams) && p.maxWeightGrams >= weightGrams);
    candidates.sort((a, b) => a.maxWeightGrams - b.maxWeightGrams || a.lengthCm * a.widthCm * a.heightCm - b.lengthCm * b.widthCm * b.heightCm || String(a._id).localeCompare(String(b._id)));
    if (!candidates.length) throw new BadRequestException('Nenhuma embalagem cadastrada comporta o peso total de ' + weightGrams + ' g. Cadastre uma embalagem com capacidade suficiente.');
    return candidates[0];
  }
  async dimensions(id: string) {
    const { lengthCm, widthCm, heightCm } = await this.get(id);
    return { lengthCm, widthCm, heightCm };
  }
}
@Controller('admin/packages')
@UseGuards(JwtAuthGuard, AdminGuard)
export class PackagingController {
  constructor(private readonly packages: PackagingService) {}
  @Get() list() { return this.packages.list(); }
  @Post() create(@Body() dto: PackagingDto) { return this.packages.create(dto); }
  @Put(':id') update(@Param('id') id: string, @Body() dto: PackagingDto) { return this.packages.update(id, dto); }
}
@Module({
  imports: [MongooseModule.forFeature([{ name: Packaging.name, schema: SchemaFactory.createForClass(Packaging) }])],
  controllers: [PackagingController], providers: [PackagingService], exports: [PackagingService],
})
export class PackagingModule {}
