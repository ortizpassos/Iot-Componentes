require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp, rm } = require('node:fs/promises');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { ValidationPipe } = require('@nestjs/common');
const { CreateProductDto } = require('../dist/products/dto/create-product.dto');
const { ProductDatasheetsService, MAX_PDF_BYTES } = require('../dist/product-images/product-datasheets.module');
test('datasheets validate content and size and reject path traversal', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'iot-datasheets-'));
  try {
    const service = new ProductDatasheetsService(directory);
    await assert.rejects(service.upload({ mimetype: 'application/pdf', buffer: Buffer.from('<html>fake</html>') }));
    await assert.rejects(service.upload({ mimetype: 'application/pdf', buffer: Buffer.alloc(MAX_PDF_BYTES + 1) }));
    const result = await service.upload({ mimetype: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%%EOF') });
    assert.match(result.datasheetUrl, /^\/api\/product-datasheets\/.*\.pdf$/);
    assert.equal((await service.read(result.datasheetUrl.split('/').pop())).getHeaders().type, 'application/pdf');
    await assert.rejects(service.read('../anything.pdf'));
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test('product accepts documents and HTTP references and rejects unsafe links', async () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
  const validate = data => pipe.transform({ name: 'Sensor', sku: 'S1', type: 'SENSOR', price: 10, stock: 1, ...data }, { type: 'body', metatype: CreateProductDto });
  const withoutSku = await pipe.transform({ name: 'Sensor', type: 'SENSOR', price: 10, stock: 1 }, { type: 'body', metatype: CreateProductDto });
  assert.equal(withoutSku.sku, undefined);
  await validate({ references: [{ label: 'Manual', url: 'https://example.com/manual' }] });
  await assert.rejects(validate({ references: [{ label: 'Manual', url: 'javascript:alert(1)' }] }));
  await assert.rejects(validate({ datasheetUrl: '/api/product-datasheets/../../secret.pdf' }));
});
