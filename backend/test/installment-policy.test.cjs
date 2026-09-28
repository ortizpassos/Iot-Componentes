require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ValidationPipe } = require('@nestjs/common');
const { CreateProductDto } = require('../dist/products/dto/create-product.dto');
const { ProductSchema } = require('../dist/products/schemas/product.schema');

test('product accepts only supported installment policy values', async () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
  const validate = installmentFeePayer => pipe.transform({ name: 'Sensor', sku: 'S1', type: 'SENSOR', price: 30, stock: 5, installmentFeePayer }, { type: 'body', metatype: CreateProductDto });
  for (const value of ['BUYER', 'SELLER']) assert.equal((await validate(value)).installmentFeePayer, value);
  for (const value of ['INVALID', true, 0]) await assert.rejects(validate(value), error => error.getStatus() === 400);
  assert.equal(ProductSchema.path('installmentFeePayer').defaultValue, 'BUYER');
});
