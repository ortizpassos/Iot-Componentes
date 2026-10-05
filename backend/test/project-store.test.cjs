require('reflect-metadata');
const { test } = require('node:test'); const assert = require('node:assert/strict');
const { plainToInstance } = require('class-transformer'); const { validate } = require('class-validator');
const { ProjectStoreService, ProjectStoreAdminController, ProjectStoreController } = require('../dist/project-store/project-store.module');
const { StoreProjectDto } = require('../dist/project-store/project-store.dto');
const { OrdersService } = require('../dist/orders/orders.service');
const { AdminService } = require('../dist/admin/admin.service');
const { JwtAuthGuard } = require('../dist/common/guards/jwt-auth.guard'); const { AdminGuard } = require('../dist/common/guards/admin.guard');
const id = '507f1f77bcf86cd799439011', assetId = '507f1f77bcf86cd799439012', productId = '507f1f77bcf86cd799439013';
const dto = () => ({ name: 'Projeto', description: 'Publico', instructions: 'Privado', active: true, digitalPrice: 25, completeEnabled: false, completePrice: 0, stock: 0, images: [], pdfs: [], firmware: [{ name: 'DevKit', chip: 'ESP32', format: 'MERGED', parts: [{ assetId, address: 0 }] }] });
test('admin-only mutation and authenticated customer endpoints', () => {
 assert.deepEqual(Reflect.getMetadata('__guards__', ProjectStoreAdminController), [JwtAuthGuard, AdminGuard]);
 assert.deepEqual(Reflect.getMetadata('__guards__', ProjectStoreController), [JwtAuthGuard]);
});
test('catalog never leaks instructions or binaries; only paid owner sees protected data', async () => {
 const project = { _id: id, ...dto(), digitalProductId: productId, completeProductId: assetId };
 let paid = false;
 const service = new ProjectStoreService({ findById: () => ({ lean: async () => project }), find: () => ({ sort: () => ({ lean: async () => [project] }) }) }, { find: () => ({ lean: async () => [{ _id: assetId, name: 'program.bin', size: 128, sha256: 'abc', kind: 'bin', data: 'must-not-leak' }] }) }, {}, { exists: async filter => { assert.equal(filter.customer, 'owner'); assert.equal(filter['items.storeProjectId'], id); assert.deepEqual(filter.status.$in, ['PAID','LABEL_ISSUED','SHIPPED','FULFILLED']); return paid; } }, {});
 const user = { userId: 'owner', role: 'CUSTOMER' };
 const catalog = await service.catalog(); assert.equal(catalog[0].instructions, undefined); assert.equal(catalog[0].firmware, undefined);
 assert.equal((await service.details(user,id)).owned, false);
 await assert.rejects(service.read(user,id,assetId), e => e.getStatus() === 403);
 paid = true; const details = await service.details(user,id); assert.equal(details.instructions,'Privado'); assert.equal(details.owned,true); assert.equal(details.assets[0].data, undefined);
 await assert.rejects(service.read(user,id,productId), e => e.getStatus() === 404);
});
test('binary and PDF URLs cannot be accessed via the public images endpoint', async () => {
 const service = new ProjectStoreService({}, { findById: () => ({ select: () => ({ lean: async () => ({ kind: 'bin' }) }) }) }, {}, {}, {});
 await assert.rejects(service.read(null,null,assetId), e => e.getStatus() === 404);
});
test('publishing resolves binary assets, rejects overlapping flash sectors and creates separate offers', async () => {
 const offers = [];
 const service = new ProjectStoreService({ findByIdAndUpdate: (id, update) => ({ lean: async () => update.$set }) }, { find: () => ({ lean: async () => [{ _id: assetId, kind: 'bin', size: 8192 }] }) }, { findByIdAndUpdate: async (id, update) => { offers.push(update.$set); } }, {}, { dimensions: async () => ({ lengthCm:20,widthCm:15,heightCm:8 }) });
 const saved = await service.save(dto()); assert.equal(saved.instructions,'Privado'); assert.equal(offers[0].deliveryKind,'DIGITAL'); assert.equal(offers[0].price,25); assert.equal(offers[1].active,false);
 const complete = { ...dto(), completeEnabled:true, completePrice:100,stock:2,weightGrams:250 }; await service.save(complete); assert.equal(offers[3].deliveryKind,'PHYSICAL'); assert.equal(offers[3].stock,2); assert.equal(offers[3].weightGrams,250); assert.equal(offers[3].lengthCm,undefined);
 await assert.rejects(service.save({ ...dto(), firmware: [] }));
 await assert.rejects(service.save({ ...dto(), completeEnabled:true }));
 const overlapping = dto(); overlapping.firmware[0].format='PARTS'; overlapping.firmware[0].parts.push({assetId,address:4096}); await assert.rejects(service.save(overlapping), /sobreposi/);
 const invalid = dto(); invalid.firmware[0].parts[0].address=4096; await assert.rejects(service.save(invalid), /endere/);
});
test('validates project input including supported chips and upload file types', async () => {
 assert.equal((await validate(plainToInstance(StoreProjectDto,dto()))).length,0);
 const wrong = dto(); wrong.firmware[0].chip='ESP8266'; assert.ok((await validate(plainToInstance(StoreProjectDto,wrong))).length);
 const service = new ProjectStoreService({}, { create: async data => ({ _id:assetId,...data }) },{},{},{});
 const file = await service.upload('bin',{ originalname:'firmware.bin',buffer:Buffer.from([0xe9,0,0,0]),mimetype:'application/octet-stream' }); assert.equal(file.sha256.length,64); assert.equal(file.data,undefined);
 await assert.rejects(service.upload('bin',{originalname:'file.exe',buffer:Buffer.from('fake')}));
 await assert.rejects(service.upload('pdf',{originalname:'manual.pdf',buffer:Buffer.from('not-pdf')}));
 await assert.rejects(service.upload('image',{originalname:'image.svg',buffer:Buffer.from('<svg></svg>')}));
});
test('digital orders snapshot entitlement without shipping; complete projects require freight', async () => {
 const product = { name:'Project', sku:'PROJ-D', price:25, stock:5,active:true, storeProjectId:id,deliveryKind:'DIGITAL',programming:{supported:false} };
 const service = new OrdersService({create: async data => data}, {findById: async () => product}, { requireCheckoutProfile: async () => ({address:{zipCode:'01001000'}}) }, {quote:async () => ({services:[{code:'1',name:'PAC',price:10,deliveryDays:4}]})});
 const digital = await service.create(id,{items:[{productId,quantity:1}]}); assert.equal(digital.requiresShipping,false); assert.equal(digital.total,25); assert.equal(digital.items[0].storeProjectId,id);
 product.deliveryKind='PHYSICAL'; await assert.rejects(service.create(id,{items:[{productId,quantity:1}]}), /frete/);
 const complete = await service.create(id,{items:[{productId,quantity:1}],shippingServiceId:'1'}); assert.equal(complete.requiresShipping,true); assert.equal(complete.total,35);
 const admin = new AdminService({}, {}, {}, {}, {}, {}, {}, {}); admin.order = async () => ({status:'PAID',requiresShipping:false}); await assert.rejects(admin.issueLabel(id), /digital/);
});

test('protected downloads return exactly the stored bytes for Mongo Binary and Buffer', async () => {
 const { Binary } = require('mongodb');
 for (const data of [Buffer.from([233,1,2,3]), new Binary(Buffer.from([233,1,2,3]))]) {
  const service = new ProjectStoreService({findById:()=>({lean:async()=>({...dto(),pdfs:[]})})}, {findById:()=>({select:()=>({lean:async()=>({kind:'bin',data,mime:'application/octet-stream',size:4,name:'program.bin'})})})}, {}, {exists:async()=>true}, {});
  const response = await service.read({userId:id,role:'CUSTOMER'},id,assetId);const chunks=[];for await (const chunk of response.getStream()) chunks.push(chunk);assert.deepEqual(Buffer.concat(chunks),Buffer.from([233,1,2,3]));
 }
});
