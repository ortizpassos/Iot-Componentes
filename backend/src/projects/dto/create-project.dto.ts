import { IsEnum, IsMongoId, IsObject, IsOptional, IsString } from 'class-validator';
import { ProjectSource } from '../schemas/project.schema';

export class CreateProjectDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsMongoId()
  deviceId?: string;

  @IsOptional()
  @IsObject()
  configuration?: Record<string, unknown>;

  @IsOptional()
  @IsEnum(ProjectSource)
  source?: ProjectSource;
}
