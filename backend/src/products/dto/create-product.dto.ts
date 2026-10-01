import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsBoolean, IsEnum, IsInt, IsNotEmpty, IsNumber, IsObject,
  IsMongoId, IsOptional, IsString, IsUrl, Matches, Max, MaxLength, Min, ValidateNested,
} from 'class-validator';
import { InstallmentFeePayer, ProductType } from '../schemas/product.schema';
import { IsProductImageUrl } from '../image-url.validator';

export class ProductProgrammingDto {
  @IsOptional()
  @IsBoolean()
  supported?: boolean;

  @IsOptional()
  @IsString()
  platform?: string;

  @IsOptional()
  @IsString()
  chip?: string;
}

export class ProductReferenceDto {
  @IsString() @IsNotEmpty() @MaxLength(100)
  label!: string;
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true }) @MaxLength(2048)
  url!: string;
}

export class CreateProductDto {
  @IsOptional() @IsMongoId() packagingId?: string;

  @IsOptional()
  @Matches(/^(|\/api\/product-datasheets\/[a-f0-9-]{36}\.pdf)$/)
  datasheetUrl?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => ProductReferenceDto)
  references?: ProductReferenceDto[];
  @IsOptional()
  @IsEnum(InstallmentFeePayer)
  installmentFeePayer?: InstallmentFeePayer;

  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @IsNotEmpty()
  name!: string;

  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @IsOptional()
  sku?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsProductImageUrl()
  imageUrl?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(4)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @IsProductImageUrl({ each: true })
  additionalImageUrls?: string[];

  @IsEnum(ProductType)
  type!: ProductType;

  @IsNumber()
  @Min(0)
  price!: number;

  @IsInt()
  @Min(0)
  stock!: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsString()
  manufacturer?: string;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsObject()
  specifications?: Record<string, unknown>;

  @IsOptional() @IsInt() @Min(1) @Max(1000000)
  weightGrams?: number;

  @IsOptional() @IsNumber() @Min(1) @Max(200)
  lengthCm?: number;

  @IsOptional() @IsNumber() @Min(1) @Max(200)
  widthCm?: number;

  @IsOptional() @IsNumber() @Min(1) @Max(200)
  heightCm?: number;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ProductProgrammingDto)
  programming?: ProductProgrammingDto;
}
