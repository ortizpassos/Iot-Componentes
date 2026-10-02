import { Type, Transform } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsMongoId, IsNotEmpty, IsNumber, IsOptional, IsString, IsUrl, Max, MaxLength, Min, ValidateNested } from 'class-validator';
export const CHIPS = ['ESP32', 'ESP32-S2', 'ESP32-S3', 'ESP32-C3', 'ESP32-C6'];
export class FirmwarePartDto {
  @IsMongoId() assetId!: string;
  @IsInt() @Min(0) @Max(33554431) address!: number;
}
export class FirmwareDto {
  @IsString() @IsNotEmpty() @MaxLength(100) name!: string;
  @IsIn(CHIPS) chip!: string;
  @IsIn(['MERGED', 'PARTS']) format!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(8) @ValidateNested({ each: true }) @Type(() => FirmwarePartDto) parts!: FirmwarePartDto[];
}
export class StoreProjectDto {
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @IsNotEmpty() @MaxLength(150) name!: string;
  @IsString() @MaxLength(20000) description!: string;
  @IsString() @MaxLength(50000) instructions!: string;
  @IsBoolean() active!: boolean;
  @IsNumber() @Min(0.01) @Max(1000000) digitalPrice!: number;
  @IsBoolean() completeEnabled!: boolean;
  @IsNumber() @Min(0) @Max(1000000) completePrice!: number;
  @IsInt() @Min(0) @Max(1000000) stock!: number;
  @IsOptional() @IsMongoId() packagingId?: string;
  @IsOptional() @IsInt() @Min(1) @Max(1000000) weightGrams?: number;
  @IsArray() @ArrayMaxSize(5) @IsMongoId({ each: true }) images!: string[];
  @IsArray() @ArrayMaxSize(10) @IsMongoId({ each: true }) pdfs!: string[];
  @IsOptional() @IsUrl({ protocols: ['https', 'http'], require_protocol: true }) @MaxLength(2048) videoUrl?: string;
  @IsArray() @ArrayMaxSize(10) @ValidateNested({ each: true }) @Type(() => FirmwareDto) firmware!: FirmwareDto[];
}
