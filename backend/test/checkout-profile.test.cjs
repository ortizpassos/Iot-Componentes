require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ValidationPipe } = require('@nestjs/common');
const { CheckoutProfileDto } = require('../dist/users/checkout-profile.dto');
const { UsersService } = require('../dist/users/users.service');
const { OrdersService } = require('../dist/orders/orders.service');
const { UserSchema } = require('../dist/users/schemas/user.schema');
const profile = { fullName: 'Cliente Teste', cpf: '52998224725', address: { zipCode: '01001000', street: 'Rua Teste', number: '10', neighborhood: 'Centro', city: 'São Paulo', state: 'SP' } };

test('delivery requires full name, valid CPF and complete address; rejects privileged fields', async () => {
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
  const validate = body => pipe.transform(body, { type: 'body', metatype: CheckoutProfileDto });
  await validate(profile);
  for (const changes of [{ fullName: 'Cliente' }, { cpf: '11111111111' }, { cpf: '52998224724' }, { address: null }, { address: { ...profile.address, street: ' ' } }, { address: { ...profile.address, zipCode: '123' } }, { address: { ...profile.address, state: 'XX' } }, { role: 'ADMIN' }, { customerId: 'other' }]) {
    await assert.rejects(validate({ ...profile, ...changes }));
  }
});
test('profile writes are scoped to authenticated user and orders require a saved profile', async () => {
  let update;
  const users = new UsersService({
    findByIdAndUpdate: (id, body) => { update = { id, body }; return { select: async () => ({ checkoutProfile: body.$set.checkoutProfile }) }; },
    findById: () => ({ select: async () => ({}) }),
  });
  assert.deepEqual(await users.saveCheckoutProfile('authenticated-user', profile), { profile });
  assert.equal(update.id, 'authenticated-user');
  assert.deepEqual(Object.keys(update.body.$set).sort(), ['checkoutProfile', 'name']);
  let persisted = false;
  const orders = new OrdersService({ create: () => { persisted = true; } }, {}, users);
  await assert.rejects(orders.create('authenticated-user', { items: [] }), e => e.getStatus() === 409);
  assert.equal(persisted, false);
  for (const path of ['checkoutProfile', 'mercadoPagoCustomerId', 'defaultCard']) assert.equal(UserSchema.path(path).options.select, false);
});
