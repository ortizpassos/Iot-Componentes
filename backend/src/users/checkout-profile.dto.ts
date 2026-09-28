import { Transform, Type } from 'class-transformer';
import { IsDefined, IsIn, IsOptional, IsString, Matches, MaxLength, Validate, ValidateNested, ValidatorConstraint, ValidatorConstraintInterface } from 'class-validator';

export const STATES = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');
const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;
@ValidatorConstraint({ name: 'cpf', async: false })
export class CpfValidator implements ValidatorConstraintInterface {
  validate(value: unknown) {
    if (typeof value !== 'string' || !/^\d{11}$/.test(value) || /^(\d)\1{10}$/.test(value)) return false;
    for (const length of [9, 10]) {
      const sum = [...value.slice(0, length)].reduce((total, digit, index) => total + Number(digit) * (length + 1 - index), 0);
      const check = (sum * 10) % 11 % 10;
      if (check !== Number(value[length])) return false;
    }
    return true;
  }
  defaultMessage() { return 'Informe um CPF válido.'; }
}
export class AddressDto {
  @Transform(trim) @IsString() @Matches(/^\d{8}$/, { message: 'Informe o CEP com 8 números.' }) zipCode!: string;
  @Transform(trim) @IsString() @Matches(/\S/) @MaxLength(150) street!: string;
  @Transform(trim) @IsString() @Matches(/\S/) @MaxLength(20) number!: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100) complement?: string;
  @Transform(trim) @IsString() @Matches(/\S/) @MaxLength(100) neighborhood!: string;
  @Transform(trim) @IsString() @Matches(/\S/) @MaxLength(100) city!: string;
  @IsIn(STATES) state!: string;
}
export class CheckoutProfileDto {
  @Transform(trim) @IsString() @Matches(/^\S+\s+\S.*$/, { message: 'Informe seu nome completo.' }) @MaxLength(150) fullName!: string;
  @IsString() @Validate(CpfValidator) cpf!: string;
  @IsDefined() @ValidateNested() @Type(() => AddressDto) address!: AddressDto;
}
