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
 const catalog = await service.catalog(); assert.equal(catalog[0].instructions, undefined); assert.equal(catalog[0].firmware, undefined); assert.equal(catalog[0].isFree, false);
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
 const service = new ProjectStoreService({ findByIdAndUpdate: (id, update) => ({ lean: async () => update.$set }) }, { find: () => ({ select: () => ({ lean: async () => [{ _id: assetId, kind: 'bin', size: 8192, detectedChip: 'ESP32' }] }) }) }, { findByIdAndUpdate: async (id, update) => { offers.push(update.$set); } }, {}, { dimensions: async () => ({ lengthCm:20,widthCm:15,heightCm:8 }) });
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
 const esp32s3 = Buffer.alloc(24); esp32s3[0] = 0xe9; esp32s3.writeUInt16LE(9, 12);
 const file = await service.upload('bin',{ originalname:'firmware.bin',buffer:esp32s3,mimetype:'application/octet-stream' }); assert.equal(file.sha256.length,64); assert.equal(file.data,undefined); assert.equal(file.detectedChip,'ESP32-S3');
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

test('deleting a project disables both offers and preserves buyer assets',async()=>{
 const calls=[];const project={digitalProductId:'digital',completeProductId:'physical'};
 const service=new ProjectStoreService({findById:()=>({lean:async()=>project}),updateOne:async(filter,update)=>calls.push(['project',update.$set])},{},{updateMany:async(filter,update)=>calls.push(['offers',filter,update])},{},{});
 await service.remove('507f1f77bcf86cd799439011');
 assert.deepEqual(calls[0],['offers',{_id:{$in:['digital','physical']}},{$set:{active:false}}]);
 assert.equal(calls[1][1].active,false);assert.ok(calls[1][1].deletedAt instanceof Date);
});

test('published free projects unlock instructions and exact binary downloads without a purchase', async () => {
 const project = { _id: id, ...dto(), isFree: true, digitalPrice: 0 };
 const bytes = Buffer.from([0xe9, 1, 2, 3]);
 const file = { _id: assetId, name: 'free.bin', kind: 'bin', mime: 'application/octet-stream', size: bytes.length, data: bytes };
 const service = new ProjectStoreService({ findById: () => ({ lean: async () => project }) }, {
  find: () => ({ lean: async () => [file] }),
  findById: () => ({ select: () => ({ lean: async () => file }) }),
 }, {}, { exists: async () => { throw new Error('A published free project must not require an order'); } }, {});
 const user = { userId: 'new-customer', role: 'CUSTOMER' };
 const details = await service.details(user, id);
 assert.equal(details.owned, true); assert.equal(details.isFree, true); assert.equal(details.instructions, 'Privado');
 assert.equal(details.assets[0].data, undefined);
 const response = await service.read(user, id, assetId);
 const chunks = []; for await (const chunk of response.getStream()) chunks.push(chunk);
 assert.deepEqual(Buffer.concat(chunks), bytes);
 await assert.rejects(service.read(null, id, assetId), e => e.getStatus() === 403);
});

test('free drafts and deleted projects stay private while previous buyers retain access', async () => {
 const project = { _id: id, ...dto(), isFree: true, active: false };
 let paid = false;
 const service = new ProjectStoreService({ findById: () => ({ lean: async () => project }) }, {
  find: () => ({ lean: async () => [] }),
  findById: () => ({ select: () => ({ lean: async () => ({ kind: 'bin', data: Buffer.from([0xe9]), size: 1, mime: 'application/octet-stream', name: 'program.bin' }) }) }),
 }, {}, { exists: async () => paid }, {});
 const user = { userId: 'customer', role: 'CUSTOMER' };
 for (const state of [{ active: false }, { active: false, deletedAt: new Date() }, { active: true, deletedAt: new Date() }]) {
  Object.assign(project, state);
  await assert.rejects(service.details(user, id), e => e.getStatus() === 404);
  await assert.rejects(service.read(user, id, assetId), e => e.getStatus() === 403);
 }
 paid = true;
 assert.equal((await service.details(user, id)).owned, true);
 assert.ok(await service.read(user, id, assetId));
 assert.equal((await service.details({ userId: 'admin', role: 'ADMIN' }, id)).owned, true);
});

test('Meu Lab query includes published free projects and paid order snapshots with no duplicate ids', async () => {
 let paidOrders = [{ items: [{ storeProjectId: id }, { storeProjectId: id }] }];
 const service = new ProjectStoreService({ find: filter => {
  assert.deepEqual(filter, { $or: [{ _id: { $in: paidOrders.length ? [id] : [] } }, { isFree: true, active: true, deletedAt: { $exists: false } }] });
  return { lean: async () => [{ _id: assetId, ...dto(), isFree: true }, ...(paidOrders.length ? [{ _id: id, ...dto() }] : [])] };
 } }, {}, {}, { find: filter => {
  assert.equal(filter.customer, 'customer');
  assert.deepEqual(filter.status.$in, ['PAID', 'LABEL_ISSUED', 'SHIPPED', 'FULFILLED']);
  return { lean: async () => paidOrders };
 } }, {});
 const mine = await service.mine('customer');
 assert.deepEqual(mine.map(p => p.isFree), [true, false]);
 assert.ok(mine.every(p => !p.instructions && !p.firmware));
 paidOrders = [];
 assert.deepEqual((await service.mine('customer')).map(p => p._id), [assetId]);
});

test('free publishing disables the digital checkout offer but can still sell the complete device', async () => {
 const offers = [];
 let previous = null;
 const service = new ProjectStoreService({
  findById: () => ({ lean: async () => previous }),
  findByIdAndUpdate: (id, update) => ({ lean: async () => update.$set }),
 }, { find: () => ({ select: () => ({ lean: async () => [{ _id: assetId, kind: 'bin', size: 8192, detectedChip: 'ESP32' }] }) }) }, { findByIdAndUpdate: async (id, update) => offers.push(update.$set) }, {}, {});
 const freeDto = { ...dto(), isFree: true, digitalPrice: 0, completeEnabled: true, completePrice: 100, weightGrams: 250, stock: 2 };
 assert.equal((await validate(plainToInstance(StoreProjectDto, freeDto))).length, 0);
 let saved = await service.save(freeDto);
 assert.equal(saved.isFree, true); assert.equal(saved.digitalPrice, 0);
 assert.equal(offers[0].active, false); assert.equal(offers[0].price, 0);
 assert.equal(offers[1].active, true); assert.equal(offers[1].price, 100);
 previous = { _id: id, ...saved };
 // Requests from older clients must preserve an existing free category when the flag is absent.
 saved = await service.save(dto(), id);
 assert.equal(saved.isFree, true); assert.equal(saved.digitalPrice, 0);
 assert.equal(offers[2].active, false);
 saved = await service.save({ ...dto(), isFree: false }, id);
 assert.equal(saved.isFree, false); assert.equal(offers[4].active, true); assert.equal(offers[4].price, 25);
 await assert.rejects(service.save({ ...dto(), isFree: false, digitalPrice: 0 }), e => e.getStatus() === 400);
 previous = null;
 await assert.rejects(service.save({ ...dto(), digitalPrice: 0 }), e => e.getStatus() === 400);
 assert.ok((await validate(plainToInstance(StoreProjectDto, { ...freeDto, isFree: 'true' }))).length);
 assert.ok((await validate(plainToInstance(StoreProjectDto, { ...freeDto, digitalPrice: -1 }))).length);
});
