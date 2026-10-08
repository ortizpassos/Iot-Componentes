require('reflect-metadata');
const { test } = require('node:test'); const assert = require('node:assert/strict');
const { plainToInstance } = require('class-transformer'); const { validate } = require('class-validator');
const { CartsService, SaveCartDto, SavedCartSchema, CartsController, AbandonedCartsController } = require('../dist/carts/carts.module');
const { JwtAuthGuard } = require('../dist/common/guards/jwt-auth.guard');
const { AdminGuard } = require('../dist/common/guards/admin.guard');
const id = '507f1f77bcf86cd799439011'; const customer = '507f1f77bcf86cd799439012';
const product = { _id: id, name: 'Sensor', price: 12.5, stock: 3, active: true };
const item = { productId: id, quantity: 2, type: 'NONE', requirements: '' };
const products = { find: () => ({ lean: async () => [product] }) };
test('cart is scoped to authenticated account; saves server price and can clear', async () => {
 let saved; const service = new CartsService({ updateOne: async (filter, update) => { assert.deepEqual(filter, { customer }); saved = update.$set; return { matchedCount: 1 }; } }, products);
 await service.save(customer, { items: [{ ...item, price: 0, name: 'Forged' }] });
 assert.equal(saved.items[0].price, 12.5); assert.equal(saved.items[0].name, 'Sensor');
 await service.save(customer, { items: [] }); assert.deepEqual(saved.items, []);
 await assert.rejects(service.save(customer, { items: [item, item] }), /repetido/);
 await assert.rejects(service.save(customer, { items: [{ ...item, quantity: 4 }] }), /insuficiente/);
});
test('concurrent first save retries duplicate-key upsert as an update', async () => {
 const calls = [];
 const carts = { updateOne: async (filter, update, options) => {
   calls.push({ filter, update, options });
   if (calls.length < 3) throw Object.assign(new Error('duplicate key'), { code: 11000 });
   return { matchedCount: 1 };
 } };
 const service = new CartsService(carts, products);
 await service.save(customer, { items: [item] });
 assert.equal(calls.length, 3);
 assert.equal(calls[0].options.upsert, true);
 assert.equal(calls[1].options.upsert, undefined);
 assert.deepEqual(calls[1].filter, { customer });
});
test('restore uses current products, limits stock and never refreshes abandonment timestamp', async () => {
 const service = new CartsService({ findOne: filter => { assert.deepEqual(filter, { customer }); return { lean: async () => ({ items: [{ ...item, quantity: 7 }, { ...item, productId: customer }] }) }; } }, products);
 const result = await service.get(customer); assert.equal(result.lines.length, 1); assert.equal(result.lines[0].quantity, 3); assert.equal(result.lines[0].product.price, 12.5);
});
test('abandonment excludes empty and recent carts and paginates', async () => {
 let filter; const query = { populate: () => query, sort: () => query, skip: value => { assert.equal(value, 20); return query; }, limit: value => { assert.equal(value, 20); return query; }, lean: async () => [{ items: [{ ...item, price: 12.5 }] }] };
 const service = new CartsService({ find: value => { filter = value; return query; }, countDocuments: async () => 21 }, products);
 const result = await service.abandoned({ page: 2, limit: 20 }); assert.equal(result.items[0].total, 25); assert.equal(result.total, 21);
 assert.deepEqual(filter['items.0'], { $exists: true }); assert.ok(Math.abs(Date.now() - filter.lastActivityAt.$lte.getTime() - 1800000) < 1000);
});
test('validation and route guards reject invalid items and protect admin list', async () => {
 assert.deepEqual(Reflect.getMetadata('__guards__', CartsController), [JwtAuthGuard]);
 assert.deepEqual(Reflect.getMetadata('__guards__', AbandonedCartsController), [JwtAuthGuard, AdminGuard]);
 assert.equal((await validate(plainToInstance(SaveCartDto, { items: [item] }))).length, 0);
 for (const items of [[{ ...item, quantity: 0 }], [{ ...item, productId: 'bad' }], [{ ...item, type: 'bad' }], Array(101).fill(item)]) assert.ok((await validate(plainToInstance(SaveCartDto, { items }))).length);
});
test('saved cart schema accepts item objects', async () => {
 const mongoose = require('mongoose');
 const model = mongoose.model('SavedCartSchemaCheck', SavedCartSchema);
 await new model({ customer, items: [{ ...item, name: 'Sensor', price: 12.5, requirements: '' }], lastActivityAt: new Date() }).validate();
});
