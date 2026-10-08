require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const { ValidationPipe } = require('@nestjs/common');
const { PaymentsService, verifySignature } = require('../dist/payments/payments.service');
const { ProviderError, MercadoPagoService } = require('../dist/payments/mercado-pago.service');
const { CreatePaymentDto } = require('../dist/payments/payment.dto');
const id = '507f1f77bcf86cd799439012', customer = '507f1f77bcf86cd799439011';
const dto = { method: 'pix', payer: { email: 'payer@example.com', identification: { type: 'CPF', number: '12345678909' } } };
const clone = value => value ? structuredClone(value) : value;
test('payment lookup casts authenticated customer IDs and preserves ownership', async () => {
  const mongoose = require('mongoose');
  const { OrderSchema } = require('../dist/orders/schemas/order.schema');
  const connection = mongoose.createConnection();
  const model = connection.model('Order', OrderSchema);
  const stored = { _id: new mongoose.Types.ObjectId(id), customer: new mongoose.Types.ObjectId(customer), status: 'PENDING', total: 89.9, items: [{ productId: id, quantity: 1, name: 'Sensor', programmingRequest: { requested: false, type: 'NONE' } }] };
  model.collection.findOne = async filter => {
    assert.ok(filter._id instanceof mongoose.Types.ObjectId);
    assert.ok(filter.customer instanceof mongoose.Types.ObjectId);
    return stored._id.equals(filter._id) && stored.customer.equals(filter.customer) ? stored : null;
  };
  try {
    const service = new PaymentsService(model, {}, { get: () => undefined });
    assert.equal((await service.status(customer, id)).orderId, id);
    await assert.rejects(service.status('507f1f77bcf86cd799439099', id), e => e.getStatus() === 404);
  } finally {
    await connection.close();
  }
});
function fixture() {
  const state = { _id: id, customer, status: 'PENDING', total: 89.9, reservationExpiresAt: new Date(Date.now() + 5 * 60_000), items: [{ productId: id, quantity: 1, name: 'Sensor', programmingRequest: { requested: false, type: 'NONE' } }] };
  const field = (obj, key) => key.split('.').reduce((o, k) => o?.[k], obj);
  const match = filter => Object.entries(filter).every(([key, value]) => {
    if (key === '$or') return value.some(match);
    const actual = field(state, key);
    if (value && typeof value === 'object') {
      if ('$exists' in value) return (actual !== undefined) === value.$exists;
      if ('$in' in value) return value.$in.includes(actual);
      if ('$lte' in value) return actual <= value.$lte;
    }
    return actual === value;
  });
  const update = data => { for (const [key, value] of Object.entries(data.$set)) { const parts = key.split('.'); if (parts.length === 1) state[key] = value; else state[parts[0]][parts[1]] = value; } };
  const query = fn => ({ select() { return this; }, async lean() { return clone(fn()); } });
  const model = {
    findOne: filter => query(() => match(filter) ? state : null),
    findOneAndUpdate: (filter, data) => query(() => { if (!match(filter)) return null; update(data); return state; }),
    updateOne: async (filter, data) => { if (match(filter)) update(data); },
  };
  let created = 0; let body; let remote;
  const provider = {
    configuration: () => ({ enabled: true }),
    create: async (input, key) => { created++; body = input; assert.equal(key, state.payment.key); remote = { id: 123, status: 'pending', currency_id: 'BRL', external_reference: input.external_reference, transaction_amount: input.transaction_amount, date_last_updated: '2026-09-25T12:00:00Z', point_of_interaction: { transaction_data: { qr_code: 'pix-code', qr_code_base64: 'base64' } } }; return clone(remote); },
    get: async () => clone(remote), search: async () => remote ? [clone(remote)] : [],
  };
  const users = {
    requireCheckoutProfile: async () => ({ fullName: 'Cliente Teste', cpf: '52998224725', address: { street: 'Rua Teste' } }),
    checkout: async () => ({ email: 'account@example.com', mercadoPagoCustomerId: 'owned-customer', defaultCard: { id: 'owned-card' } }),
    saveDefaultCard: async () => {},
  };
  const products = { findById: async () => ({ active: true, stock: 20 }) };
  const service = new PaymentsService(model, provider, { get: key => key === 'MP_WEBHOOK_SECRET' ? 'test-secret' : undefined }, users, products);
  return { service, state, provider, users, products, created: () => created, body: () => body, remote: () => remote };
}

test('missing delivery profile blocks payment before creating a charge', async () => {
  const f = fixture();
  f.users.requireCheckoutProfile = async () => { throw new (require('@nestjs/common').ConflictException)('Complete seus dados'); };
  await assert.rejects(f.service.create(customer, id, dto), e => e.getStatus() === 409);
  assert.equal(f.created(), 0); assert.equal(f.state.payment, undefined);
});

test('card saving requires explicit consent and never changes an approved payment on failure', async () => {
  const cardDto = { ...dto, method: 'card', token: 'one-use-token', paymentMethodId: 'visa', installments: 1 };
  for (const choice of ['none', 'save', 'failure']) {
    const f = fixture(); let saves = 0; let stored;
    const create = f.provider.create;
    f.provider.create = async (...args) => ({ ...await create(...args), status: 'approved' });
    f.provider.saveCard = async (owner, token) => { saves++; assert.equal(owner, 'owned-customer'); assert.equal(token, 'one-use-token'); if (choice === 'failure') throw new Error('unavailable'); return { id: 'new-card', last_four_digits: '1234', payment_method: { id: 'visa' }, sensitiveField: 'never-store' }; };
    f.users.saveDefaultCard = async (owner, card) => { assert.equal(owner, customer); stored = card; };
    const result = await f.service.create(customer, id, { ...cardDto, saveCard: choice !== 'none' });
    assert.equal(result.orderStatus, 'PAID'); assert.equal(f.created(), 1);
    assert.equal(saves, choice === 'none' ? 0 : 1);
    assert.equal(result.payment.cardSaving, choice === 'none' ? undefined : choice === 'save' ? 'saved' : 'failed');
    if (stored) assert.deepEqual(Object.keys(stored).sort(), ['brand', 'id', 'lastFour', 'savedAt']);
    assert.equal(JSON.stringify(f.state).includes('one-use-token'), false);
  }
});

test('saved card payments use only the authenticated customer provider ID', async () => {
  const f = fixture();
  await f.service.create(customer, id, { ...dto, method: 'card', token: 'new-cvv-token', paymentMethodId: 'visa', installments: 1, useSavedCard: true });
  assert.equal(f.body().payer.id, 'owned-customer'); assert.equal(f.body().payer.type, 'customer');
  assert.equal(f.body().statement_descriptor, 'IOT-COMPONENT');
  assert.ok(f.body().description.startsWith('IOT-Componentes - Pedido '));
  const g = fixture(); g.users.checkout = async () => ({ email: 'other@example.com' });
  await assert.rejects(g.service.create(customer, id, { ...dto, method: 'card', token: 'x', paymentMethodId: 'visa', installments: 1, useSavedCard: true }), e => e.getStatus() === 400);
  assert.equal(g.created(), 0);
});

test('first saved card creates and links a provider customer using the account email', async () => {
  const f = fixture(); let linked = false; let cardSaved = false;
  const create = f.provider.create;
  f.provider.create = async (...args) => ({ ...await create(...args), status: 'approved' });
  f.users.checkout = async () => ({ email: 'account@example.com' });
  f.provider.createCustomer = async (email, reference) => { assert.equal(email, 'account@example.com'); assert.equal(reference, `store-user-${customer}`); return { id: 'new-customer' }; };
  f.users.linkPaymentCustomer = async (id, providerId) => { assert.equal(id, customer); assert.equal(providerId, 'new-customer'); linked = true; return providerId; };
  f.provider.saveCard = async (providerId, token) => { assert.ok(linked); assert.equal(providerId, 'new-customer'); assert.equal(token, 'token'); return { id: 'new-card', last_four_digits: '1234', payment_method: { id: 'visa' } }; };
  f.users.saveDefaultCard = async () => { cardSaved = true; };
  const result = await f.service.create(customer, id, { ...dto, method: 'card', token: 'token', paymentMethodId: 'visa', installments: 1, saveCard: true });
  assert.ok(cardSaved); assert.equal(result.payment.cardSaving, 'saved');
});
test('server total and ownership govern payment, concurrent submissions create one charge', async () => {
  const f = fixture();
  await assert.rejects(f.service.create('other', id, dto), e => e.getStatus() === 404);
  const responses = await Promise.all([f.service.create(customer, id, dto), f.service.create(customer, id, dto)]);
  assert.equal(f.created(), 1); assert.equal(f.body().transaction_amount, 89.9);
  assert.equal(f.body().statement_descriptor, undefined);
  assert.equal(responses[0].payment.qrCode, 'pix-code'); assert.equal(f.state.status, 'PENDING');
  await f.service.create(customer, id, dto); assert.equal(f.created(), 1);
  f.remote().status = 'approved'; f.remote().date_last_updated = '2026-09-25T12:01:00Z';
  assert.equal((await f.service.status(customer, id)).orderStatus, 'PAID');
  await assert.rejects(f.service.create(customer, id, dto), e => e.getStatus() === 409);
});
test('programming requests, cancelled orders and zero totals cannot be charged', async () => {
  for (const change of [s => s.items[0].programmingRequest = { requested: true, type: 'CUSTOM' }, s => s.status = 'CANCELLED', s => s.total = 0]) {
    const f = fixture(); change(f.state); await assert.rejects(f.service.create(customer, id, dto), e => e.getStatus() === 409); assert.equal(f.created(), 0);
  }
});
test('unknown network result stays locked; rejected data permits retry', async () => {
  const f = fixture(); f.provider.create = async () => { throw new ProviderError(503); };
  await assert.rejects(f.service.create(customer, id, dto), e => e.getStatus() === 503);
  assert.equal((await f.service.status(customer, id)).canPay, false);
  let called = false; f.provider.create = async () => { called = true; };
  await f.service.create(customer, id, dto); assert.equal(called, false);
  const g = fixture(); g.provider.create = async () => { throw new ProviderError(400); };
  await assert.rejects(g.service.create(customer, id, dto), e => e.getStatus() === 400);
  assert.equal((await g.service.status(customer, id)).canPay, true);
});
test('webhooks require valid signature and provider-verified amount; older states cannot regress payment', async () => {
  const f = fixture(); await f.service.create(customer, id, dto);
  await assert.rejects(f.service.webhook('123', 'req-1', 'invalid'), e => e.getStatus() === 401);
  const signature = 'ts=1704908010,v1=' + createHmac('sha256', 'test-secret').update('id:123;request-id:req-1;ts:1704908010;').digest('hex');
  assert.equal(verifySignature('test-secret', '999', 'req-1', signature), false);
  f.remote().status = 'approved'; f.remote().transaction_amount = 1;
  await assert.rejects(f.service.webhook('123', 'req-1', signature), e => e.getStatus() === 409);
  assert.equal(f.state.status, 'PENDING');
  f.remote().transaction_amount = 89.9; f.remote().date_last_updated = '2026-09-25T12:02:00Z';
  await f.service.webhook('123', 'req-1', signature); assert.equal(f.state.status, 'PAID');
  await f.service.apply({ ...f.remote(), status: 'pending', date_last_updated: '2026-09-25T12:01:00Z' }); assert.equal(f.state.payment.status, 'approved');
  f.remote().status = 'refunded'; f.remote().date_last_updated = '2026-09-25T12:03:00Z';
  await f.service.webhook('123', 'req-1', signature); assert.equal(f.state.status, 'CANCELLED');
});
test('payment DTO rejects client totals/card numbers and config never exposes private keys', async () => {
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
  const validate = body => pipe.transform(body, { type: 'body', metatype: CreatePaymentDto });
  await validate(dto);
  for (const extra of [{ total: 1 }, { transaction_amount: 1 }, { cardNumber: '4111111111111111' }, { installments: 100 }, { method: 'cash' }]) await assert.rejects(validate({ ...dto, ...extra }));
  const config = new MercadoPagoService({ get: key => ({ MP_ACCESS_TOKEN: 'private-secret', MP_PUBLIC_KEY: 'public-key' })[key] }).configuration();
  assert.deepEqual(config, { enabled: true, publicKey: 'public-key' });
});

test('method change cancels pending Pix before allowing another payment', async () => {
  const f = fixture(); await f.service.create(customer, id, dto);
  f.provider.cancel = async () => { f.remote().status = 'cancelled'; return clone(f.remote()); };
  const result = await f.service.changeMethod(customer, id);
  assert.equal(result.canPay, true); assert.equal(result.payment.status, 'cancelled');
  assert.equal(f.created(), 1);
  await assert.rejects(f.service.changeMethod('507f1f77bcf86cd799439099', id), e => e.getStatus() === 404);
});
test('failed cancellation or approval during switch never enables another charge', async () => {
  const f = fixture(); await f.service.create(customer, id, dto);
  f.provider.cancel = async () => { throw new ProviderError(503); };
  await assert.rejects(f.service.changeMethod(customer, id), e => e.getStatus() === 503);
  assert.equal((await f.service.status(customer, id)).canPay, false);
  f.remote().status = 'approved';
  const result = await f.service.changeMethod(customer, id);
  assert.equal(result.orderStatus, 'PAID'); assert.equal(result.canPay, false);
});

test('payment uses the stock reservation instead of the remaining catalog stock', async () => {
 const f = fixture(); f.products.findById = async () => ({ active: true, stock: 0 });
 await f.service.create(customer, id, dto);
 assert.equal(f.created(), 1);
});
