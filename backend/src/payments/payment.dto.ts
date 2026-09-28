import { Type } from 'class-transformer';
import { IsBoolean, IsDefined, IsEmail, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';

class IdentificationDto {
  @IsIn(['CPF', 'CNPJ']) type!: string;
  @IsString() @Matches(/^\d{11}$|^\d{14}$/) number!: string;
}
class PayerDto {
  @IsEmail() @MaxLength(254) email!: string;
  @IsDefined() @ValidateNested() @Type(() => IdentificationDto) identification!: IdentificationDto;
}
export class CreatePaymentDto {
  @IsOptional() @IsBoolean() saveCard?: boolean;
  @IsOptional() @IsBoolean() useSavedCard?: boolean;
  @IsIn(['pix', 'card']) method!: 'pix' | 'card';
  @IsDefined() @ValidateNested() @Type(() => PayerDto) payer!: PayerDto;
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(200) token?: string;
  @IsOptional() @IsString() @Matches(/^[a-zA-Z0-9_]+$/) @MaxLength(50) paymentMethodId?: string;
  @IsOptional() @IsString() @Matches(/^\d+$/) @MaxLength(30) issuerId?: string;
  @IsOptional() @IsInt() @Min(1) @Max(12) installments?: number;
}
