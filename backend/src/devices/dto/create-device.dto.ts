import { IsObject, IsOptional, IsString } from 'class-validator';

export class CreateDeviceDto {
  @IsString()
  name!: string;

  @IsString()
  board!: string;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsString()
  serialNumber?: string;

  @IsOptional()
  @IsString()
  macAddress?: string;

  @IsOptional()
  @IsObject()
  hardware?: Record<string, unknown>;
}
