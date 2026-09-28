import { ValidateBy, ValidationOptions } from 'class-validator';

export const PRODUCT_IMAGE_FILENAME = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.(jpg|png|webp)$/;

export function isProductImageUrl(value: unknown): boolean {
  if (typeof value !== 'string' || value.length > 2048) return false;
  if (value === '') return true;
  const prefix = '/api/product-images/';
  if (value.startsWith(prefix)) return PRODUCT_IMAGE_FILENAME.test(value.slice(prefix.length));
  if (!/^https?:\/\//i.test(value) || /\s/.test(value)) return false;
  try {
    const url = new URL(value);
    return !!url.hostname && !url.username && !url.password && ['http:', 'https:'].includes(url.protocol);
  } catch { return false; }
}

export function IsProductImageUrl(options?: ValidationOptions) {
  return ValidateBy({ name: 'isProductImageUrl', validator: {
    validate: isProductImageUrl,
    defaultMessage: () => 'Informe um link HTTP/HTTPS válido ou uma imagem enviada pela loja.',
  } }, options);
}
