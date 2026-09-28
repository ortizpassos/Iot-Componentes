require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ValidationPipe } = require('@nestjs/common');
const { CreateProductDto } = require('../dist/products/dto/create-product.dto');
test('product gallery allows a cover plus four valid additional images', async () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
  const urls = [1, 2, 3, 4].map(i => `https://example.com/${i}.jpg`);
  const validate = additionalImageUrls => pipe.transform({ name: 'Sensor', sku: 'S1', type: 'SENSOR', price: 30, stock: 5, imageUrl: 'https://example.com/cover.jpg', additionalImageUrls }, { type: 'body', metatype: CreateProductDto });
  assert.deepEqual((await validate(urls)).additionalImageUrls, urls);
  assert.deepEqual((await validate([])).additionalImageUrls, []);
  for (const invalid of [[...urls, urls[0]], ['javascript:alert(1)'], [''], [42], 'not-an-array']) await assert.rejects(validate(invalid), error => error.getStatus() === 400);
});
