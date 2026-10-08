require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ValidationPipe } = require('@nestjs/common');
const { OrdersService } = require('../dist/orders/orders.service');
const { CreateOrderDto } = require('../dist/orders/dto/create-order.dto');
const { OrdersController } = require('../dist/orders/orders.controller');
const { JwtAuthGuard } = require('../dist/common/guards/jwt-auth.guard');

const customer = '507f1f77bcf86cd799439011';
const productId = '507f1f77bcf86cd799439012';
const orderId = '507f1f77bcf86cd799439013';
const body = (extra = {}) => ({ items: [{ productId, quantity: 3, ...extra }] });
function fixture() {
  const product = { name: 'ESP32', sku: 'ESP-001', price: 89.9, stock: 20, active: true, programming: { supported: true } };
  const saved = [];
  const service = new OrdersService({
    create: async value => { saved.push(value); return value; },
    findOneAndUpdate: filter => ({ lean: async () => filter.customer === customer ? saved[0] : null }),
    findOne: filter => ({ lean: async () => filter.customer === customer ? saved[0] : null }),
    find: filter => { assert.deepEqual(filter, { customer }); return { sort: sort => {
      assert.deepEqual(sort, { createdAt: -1 }); return { lean: async () => saved };
    } }; },
  }, { findById: async () => product, reserveStock: async () => product, releaseStock: async () => [] }, { requireCheckoutProfile: async () => ({ fullName: 'Cliente Teste', cpf: '52998224725', address: { street: 'Rua Teste', number: '10', zipCode: '01001000', neighborhood: 'Centro', city: 'São Paulo', state: 'SP' } }) });
  return { service, product, saved };
}

test('snapshot and totals survive catalog changes', async () => {
  const { service, product } = fixture();
  product.installmentFeePayer = 'SELLER';
  const order = await service.create(customer, body());
  assert.equal(order.total, 269.7);
  assert.equal(order.status, 'PENDING');
  assert.ok(order.reservationExpiresAt > new Date());
  assert.equal(order.checkoutProfile.address.street, 'Rua Teste');
  assert.equal(String(order.customer), customer);
  assert.deepEqual(order.items[0].programmingRequest, { requested: false, type: 'NONE' });
  product.price = 109.9;
  product.installmentFeePayer = 'BUYER';
  product.name = 'Changed';
  product.sku = 'Changed';
  const stored = await service.findOne(customer, orderId);
  assert.equal(stored.items[0].unitPrice, 89.9);
  assert.equal(stored.items[0].name, 'ESP32');
  assert.equal(stored.items[0].sku, 'ESP-001');
  assert.equal(stored.items[0].installmentFeePayer, 'SELLER');
  assert.equal((await service.findAll(customer)).length, 1);
  await assert.rejects(service.findOne(productId, orderId), e => e.getStatus() === 404);
  await assert.rejects(service.findOne(customer, 'bad'), e => e.getStatus() === 400);
});

test('invalid requests do not persist orders', async () => {
  const { service, product, saved } = fixture();
  await assert.rejects(service.create(customer, body({ quantity: 21 })), e => e.getStatus() === 400);
  product.stock = 0;
  await assert.rejects(service.create(customer, body({ quantity: 1 })), e => e.getStatus() === 400);
  product.stock = 20;
  await assert.rejects(service.create(customer, { items: [...body().items, ...body().items] }));
  for (const request of [
    { requested: true, type: 'NONE' },
    { requested: false, type: 'AI' },
    { requested: true, type: 'CUSTOM', requirements: ' ' },
    { requested: false, type: 'NONE', requirements: 'Unexpected' },
  ]) await assert.rejects(service.create(customer, body({ programmingRequest: request })), e => e.getStatus() === 400);
  product.programming.supported = false;
  await assert.rejects(service.create(customer, body({ programmingRequest: { requested: true, type: 'STANDARD' } })));
  product.active = false;
  await assert.rejects(service.create(customer, body()));
  assert.equal(saved.length, 0);
});

test('programming requirements are stored and integer cents avoid floating point totals', async () => {
  const { service, product } = fixture();
  product.price = 0.1;
  const order = await service.create(customer, body({ programmingRequest: { requested: true, type: 'AI', requirements: ' Detectar movimento ' } }));
  assert.equal(order.total, 0.3);
  assert.equal(order.items[0].programmingRequest.requirements, 'Detectar movimento');
});

test('DTO rejects empty items, invalid quantities, IDs and client-controlled prices/ownership', async () => {
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
  const validate = value => pipe.transform(value, { type: 'body', metatype: CreateOrderDto });
  await validate(body());
  for (const value of [
    { items: [] }, body({ quantity: 0 }), body({ quantity: 1.5 }), body({ productId: 'bad' }),
    body({ unitPrice: 0 }), { ...body(), total: 0 }, { ...body(), customer: productId },
    { ...body(), status: 'PAID' }, body({ programmingRequest: { requested: true, type: 'OTHER' } }),
    body({ programmingRequest: { requested: true, type: 'STANDARD', projectId: orderId } }),
  ]) await assert.rejects(validate(value), e => e.getStatus() === 400);
  assert.ok(Reflect.getMetadata('__guards__', OrdersController).includes(JwtAuthGuard));
});
