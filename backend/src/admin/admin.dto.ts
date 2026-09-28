import { IsBoolean, IsEnum, IsInt, IsMongoId, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { OrderStatus } from '../orders/schemas/order.schema';
import { CreateDeviceDto } from '../devices/dto/create-device.dto';
import { CreateProjectDto } from '../projects/dto/create-project.dto';
import { ProjectStatus } from '../projects/schemas/project.schema';

export class AdminListDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page: number = 1;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit: number = 20;

  @IsOptional() @IsString()
  search?: string;
}
export class ActiveDto { @IsBoolean() active!: boolean; }
export class OrderStatusDto { @IsEnum(OrderStatus) status!: OrderStatus; }
export class AdminDeviceDto extends CreateDeviceDto {
  @IsMongoId() ownerId!: string;
}
export class AdminProjectDto extends CreateProjectDto {
  @IsMongoId() ownerId!: string;
  @IsOptional() @IsEnum(ProjectStatus) status?: ProjectStatus;
}
