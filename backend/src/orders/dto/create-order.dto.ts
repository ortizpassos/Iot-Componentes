import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsEnum, IsInt,
  IsMongoId, IsObject, IsOptional, IsString, Max, MaxLength, Min, ValidateNested,
} from 'class-validator';
import { ProgrammingType } from '../schemas/order.schema';

export class ProgrammingRequestDto {
  @IsBoolean()
  requested!: boolean;

  @IsEnum(ProgrammingType)
  type!: ProgrammingType;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  requirements?: string;
}

export class CreateOrderItemDto {
  @IsMongoId()
  productId!: string;

  @IsInt()
  @Min(1)
  @Max(10000)
  quantity!: number;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ProgrammingRequestDto)
  programmingRequest?: ProgrammingRequestDto;
}

export class CreateOrderDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items!: CreateOrderItemDto[];
}
