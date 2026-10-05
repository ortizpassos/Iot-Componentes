require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validate } = require('class-validator');
const { plainToInstance } = require('class-transformer');
const { PackagingService, PackagingDto, PackagingController } = require('../dist/packaging/packaging.module');
const { AdminGuard } = require('../dist/common/guards/admin.guard');
const { JwtAuthGuard } = require('../dist/common/guards/jwt-auth.guard');
const { ProductsService } = require('../dist/products/products.service');
const { AdminService } = require('../dist/admin/admin.service');
const { ShippingService } = require('../dist/shipping/shipping.module');
const id = '507f1f77bcf86cd799439011';
const dimensions = { lengthCm: 20, widthCm: 15, heightCm: 8 };
test('packaging validates dimensions and trimmed name, and restricts routes to admins', async () => {
  assert.equal((await validate(plainToInstance(PackagingDto, { name: ' Small ', ...dimensions, maxWeightGrams: 500 }))).length, 0);
  assert.ok((await validate(plainToInstance(PackagingDto, { name: ' ', lengthCm: 0, widthCm: 201, heightCm: '8' }))).length >= 4);
  assert.deepEqual(Reflect.getMetadata('__guards__', PackagingController), [JwtAuthGuard, AdminGuard]);
});
test('missing or invalid packaging is rejected', async () => {
  const service = new PackagingService({ findById: () => ({ lean: async () => null }) });
  await assert.rejects(service.dimensions('invalid'));
  await assert.rejects(service.dimensions(id), /encontrada/);
});
test('both product creation paths and editing resolve packaging server-side', async () => {
  const packaging = { dimensions: async value => { assert.equal(value, id); return dimensions; } };
  const model = { create: async value => value, findByIdAndUpdate: (id, update) => ({ lean: async () => update.$set }) };
  const dto = { name: 'Part', sku: 'A1', type: 'BOARD', price: 1, packagingId: id, weightGrams: 90, lengthCm: 999 };
  const products = new ProductsService(model, {}, packaging);
  const admin = new AdminService(model, {}, {}, {}, {}, {}, {}, packaging);
  for (const saved of [await products.create(dto), await admin.createProduct(dto), await admin.updateProduct(id, dto)]) {
    assert.equal(saved.packagingId, id); assert.equal(saved.weightGrams, 90);
    assert.equal(saved.lengthCm, 20); assert.equal(saved.widthCm, 15); assert.equal(saved.heightCm, 8);
  }
});
test('freight selects one parcel by total weight, ignoring legacy product dimensions', async () => {
  const originalFetch = global.fetch;
  let payload;
  global.fetch = async (url, options) => { payload = JSON.parse(options.body); return { ok: true, status: 200, json: async () => [{ id: 1, name: 'PAC', price: '10' }] }; };
  try {
    for (const usePackaging of [true, false]) {
      const product = { _id: id, name: 'Part', weightGrams: 250, lengthCm: 10, widthCm: 9, heightCm: 4, ...(usePackaging ? { packagingId: id } : {}) };
      const service = new ShippingService({ find: () => ({ lean: async () => [product] }) }, { getShippingSender: async () => ({ address: { zipCode: '89031555' } }) }, { get: key => key === 'SUPERFRETE_TOKEN' ? 'test' : undefined }, { selectForWeight: async weight => { assert.equal(weight, 500); return dimensions; } });
      await service.quote({ destinationZipCode: '01001000', items: [{ productId: id, quantity: 2 }] });
      assert.deepEqual(payload.products, [{ quantity: 1, height: 8, length: 20, width: 15, weight: 0.5 }]);
    }
  } finally { global.fetch = originalFetch; }
});

test('automatic packaging uses the smallest sufficient capacity and accepts exact limit', async () => {
 const boxes=[{_id:'b',...dimensions,maxWeightGrams:1000},{_id:'old',...dimensions},{_id:'a',...dimensions,maxWeightGrams:500}];
 const service=new PackagingService({find:()=>({sort:()=>({lean:async()=>boxes})})});
 assert.equal((await service.selectForWeight(500))._id,'a');
 assert.equal((await service.selectForWeight(501))._id,'b');
 await assert.rejects(service.selectForWeight(1001),/Nenhuma embalagem/);
 await assert.rejects(service.selectForWeight(0));
 for(const value of [undefined,0,-1,1.5])assert.ok((await validate(plainToInstance(PackagingDto,{name:'Box',...dimensions,maxWeightGrams:value}))).length);
});
test('mixed cart sums physical weights times quantities and excludes digital projects',async()=>{
 const second='507f1f77bcf86cd799439012',digital='507f1f77bcf86cd799439013';
 const products=[{_id:id,name:'Sensor',weightGrams:100},{_id:second,name:'Board',weightGrams:250},{_id:digital,deliveryKind:'DIGITAL'}];
 let called=false;const service=new ShippingService({find:()=>({lean:async()=>products})},{getShippingSender:async()=>({address:{zipCode:'89031555'}})},{get:()=>undefined},{selectForWeight:async weight=>{assert.equal(weight,800);called=true;return dimensions;}});
 await assert.rejects(service.quote({destinationZipCode:'01001000',items:[{productId:id,quantity:3},{productId:second,quantity:2},{productId:digital,quantity:1}]}),/SUPERFRETE_TOKEN/);assert.ok(called);
 products[0].weightGrams=undefined;called=false;
 await assert.rejects(service.quote({destinationZipCode:'01001000',items:[{productId:id,quantity:1}]}),/peso/);assert.equal(called,false);
});
