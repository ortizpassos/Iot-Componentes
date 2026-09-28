require('reflect-metadata');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { Test } = require('@nestjs/testing');
const { ValidationPipe } = require('@nestjs/common');
const { ConfigService } = require('@nestjs/config');
const { JwtService } = require('@nestjs/jwt');
const { PassportModule } = require('@nestjs/passport');
const { AdminController } = require('../dist/admin/admin.controller');
const { AdminService } = require('../dist/admin/admin.service');
const { AdminListDto } = require('../dist/admin/admin.dto');
const { ProductsController } = require('../dist/products/products.controller');
const { ProductsService } = require('../dist/products/products.service');
const { JwtStrategy } = require('../dist/auth/strategies/jwt.strategy');
const { UsersService } = require('../dist/users/users.service');
const { RegisterDto } = require('../dist/auth/dto/register.dto');
const { AuthService } = require('../dist/auth/auth.service');
const { SettingsController, SettingsService, StoreSettingsDto, defaults } = require('../dist/settings/settings.module');
const { ProductImagesController, ProductImagesUploadController, ProductImagesService, IMAGE_DIRECTORY } = require('../dist/product-images/product-images.module');
const { CreateProductDto } = require('../dist/products/dto/create-product.dto');
const { mkdtemp, readdir, unlink, rmdir } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

const id = '507f1f77bcf86cd799439011';
let app, base, token, account, imageDirectory;
before(async () => {
  imageDirectory = await mkdtemp(join(tmpdir(), 'iot-image-test-'));
  const secret = 'admin-tests-only-not-a-production-secret';
  const module = await Test.createTestingModule({
    imports: [PassportModule], controllers: [AdminController, ProductsController, SettingsController, ProductImagesController, ProductImagesUploadController],
    providers: [JwtStrategy,
      ProductImagesService, { provide: IMAGE_DIRECTORY, useValue: imageDirectory },
      { provide: ConfigService, useValue: { getOrThrow: () => secret } },
      { provide: UsersService, useValue: { findById: async () => account } },
      { provide: AdminService, useValue: { listUsers: () => ({ items: [], total: 0 }), createProduct: dto => dto, deleteProduct: () => ({ deleted: true }) } },
      { provide: SettingsService, useValue: { get: () => defaults, save: dto => dto, getShippingSender: async () => undefined, saveShippingSender: async sender => ({ sender }) } },
      { provide: ProductsService, useValue: { create: dto => dto } },
    ],
  }).compile();
  app = module.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.listen(0, '127.0.0.1'); base = await app.getUrl();
  token = new JwtService({ secret }).sign({ sub: id, role: 'ADMIN', email: 'test@example.com' });
});
after(async () => {
  if (app) await app.close();
  if (imageDirectory) { for (const name of await readdir(imageDirectory)) await unlink(join(imageDirectory, name)); await rmdir(imageDirectory); }
});
const request = (path, options = {}) => fetch(`${base}/api/${path}`, options);
const headers = () => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });

test('HTTP authorization requires current active ADMIN, not the JWT role claim', async () => {
  account = { active: true, role: 'CUSTOMER', email: 'test@example.com' };
  assert.equal((await request('admin/access')).status, 401);
  assert.equal((await request('admin/users', { headers: headers() })).status, 403);
  assert.equal((await request('settings/shipping-sender')).status, 401);
  assert.equal((await request('settings/shipping-sender', { headers: headers() })).status, 403);
  assert.equal((await request('settings/shipping-sender', { method: 'PUT', headers: headers(), body: '{}' })).status, 403);
  assert.equal((await request(`admin/orders/${id}/ship`, { method: 'POST', headers: headers() })).status, 403);
  assert.equal((await request(`admin/orders/${id}/shipping-label`, { headers: headers() })).status, 403);
  assert.equal((await request(`admin/orders/${id}/shipping-label`)).status, 401);
  assert.equal((await request('products', { method: 'POST', headers: headers(), body: '{}' })).status, 403);
  assert.equal((await request(`admin/products/${id}`, { method: 'DELETE', headers: headers() })).status, 403);
  assert.equal((await request('settings', { method: 'PUT', headers: headers(), body: JSON.stringify(defaults) })).status, 403);
  assert.equal((await request('settings')).status, 200);
  for (const path of ['admin/products', 'admin/orders', 'admin/devices', 'admin/projects']) {
    assert.equal((await request(path, { headers: headers() })).status, 403);
  }
  account.role = 'ADMIN';
  assert.equal((await request('settings/shipping-sender', { headers: headers() })).status, 200);
  assert.equal((await request('settings/shipping-sender', { method: 'PUT', headers: headers(), body: '{}' })).status, 400);
  const sender = { fullName: 'Loja Teste', address: { zipCode: '01001000', street: 'Rua Teste', number: '10', neighborhood: 'Centro', city: 'São Paulo', state: 'SP' } };
  const senderResponse = await request('settings/shipping-sender', { method: 'PUT', headers: headers(), body: JSON.stringify(sender) });
  assert.equal(senderResponse.status, 200); assert.deepEqual(await senderResponse.json(), { sender });
  assert.equal((await request(`admin/products/${id}`, { method: 'DELETE', headers: headers() })).status, 200);
  assert.equal((await request('settings', { method: 'PUT', headers: headers(), body: JSON.stringify(defaults) })).status, 200);
  assert.equal((await request('admin/access', { headers: headers() })).status, 200);
  assert.equal((await request('admin/users', { headers: headers() })).status, 200);
  const body = { name: 'ESP32', sku: 'ESP-001', type: 'BOARD', price: 89.9, stock: 20 };
  assert.equal((await request('products', { method: 'POST', headers: headers(), body: JSON.stringify(body) })).status, 201);
  assert.equal((await request('admin/products', { method: 'POST', headers: headers(), body: JSON.stringify(body) })).status, 201);
  account.role = 'CUSTOMER';
  assert.equal((await request('admin/access', { headers: headers() })).status, 403);
  account.active = false;
  assert.equal((await request('admin/access', { headers: headers() })).status, 401);
  account = null;
  assert.equal((await request('admin/access', { headers: headers() })).status, 401);
});

test('registration cannot choose role, inactive users cannot log in, query bounds are validated', async () => {
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
  await assert.rejects(pipe.transform({ name: 'Test', email: 'test@example.com', password: '12345678', role: 'ADMIN' }, { type: 'body', metatype: RegisterDto }), e => e.getStatus() === 400);
  const auth = new AuthService({ findByEmail: async () => ({ active: false }) }, {});
  await assert.rejects(auth.login({ email: 'test@example.com', password: 'test' }), e => e.getStatus() === 401);
  const defaults = await pipe.transform({}, { type: 'query', metatype: AdminListDto });
  assert.equal(defaults.page, 1); assert.equal(defaults.limit, 20);
  await assert.rejects(pipe.transform({ limit: 1000 }, { type: 'query', metatype: AdminListDto }));
});

test('order status updates are conditional and preserve price snapshots', async () => {
  const order = { _id: id, status: 'PENDING', total: 89.9, items: [{ name: 'Original', unitPrice: 89.9 }] };
  const query = value => ({ populate: () => ({ lean: async () => value }) });
  let update;
  const orders = { findById: () => query(order), findOneAndUpdate: (filter, fields) => { update = { filter, fields }; return query({ ...order, status: fields.$set.status }); } };
  const admin = new AdminService({}, orders, {}, {}, {});
  await admin.orderStatus(id, 'PAID');
  assert.equal(update.filter.status, 'PENDING');
  assert.deepEqual(update.fields, { $set: { status: 'PAID' } });
  await assert.rejects(admin.orderStatus(id, 'FULFILLED'), e => e.getStatus() === 409);
  orders.findOneAndUpdate = () => query(null);
  await assert.rejects(admin.orderStatus(id, 'PAID'), e => e.getStatus() === 409);
});

test('administrative accounts cannot be disabled via customer management', async () => {
  let filter;
  const users = { findOneAndUpdate: value => { filter = value; return { select: () => ({ lean: async () => null }) }; } };
  const admin = new AdminService({}, {}, users, {}, {});
  await assert.rejects(admin.userActive(id, false), e => e.getStatus() === 409);
  assert.deepEqual(filter.role, { $ne: 'ADMIN' });
});

test('projects cannot link devices belonging to another customer', async () => {
  const admin = new AdminService({}, {}, { exists: async () => true }, { exists: async () => false }, {});
  await assert.rejects(admin.saveProject({ name: 'Project', ownerId: id, deviceId: id }), e => e.getStatus() === 400);
});

test('user listing omits passwords and search text is escaped', async () => {
  let selected, filter;
  const query = { select: value => { selected = value; return query; }, sort: () => query, skip: () => query, limit: () => query, lean: async () => [] };
  const users = { find: value => { filter = value; return query; }, countDocuments: async () => 0 };
  const admin = new AdminService({}, {}, users, {}, {});
  await admin.listUsers({ page: 1, limit: 20, search: 'a.*' });
  assert.equal(selected, '-password');
  assert.equal(filter.$or[0].name.$regex, 'a\\.\\*');
});

test('product deletion removes only the selected product, preserving order snapshots', async () => {
  let filter;
  const admin = new AdminService({ deleteOne: async value => { filter = value; return { deletedCount: 1 }; } }, {}, {}, {}, {});
  assert.deepEqual(await admin.deleteProduct(id), { deleted: true });
  assert.equal(String(filter._id), id);
  await assert.rejects(admin.deleteProduct('invalid'), e => e.getStatus() === 400);
  const missing = new AdminService({ deleteOne: async () => ({ deletedCount: 0 }) }, {}, {}, {}, {});
  await assert.rejects(missing.deleteProduct(id), e => e.getStatus() === 404);
});

test('settings validate content and persist only public store values', async () => {
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
  const validate = body => pipe.transform(body, { type: 'body', metatype: StoreSettingsDto });
  await validate(defaults);
  const slide = { title: 'Novidades', description: 'Confira nossos produtos', imageUrl: 'https://example.com/banner.png' };
  await validate({ ...defaults, bannerSlides: [slide], bannerInterval: 3 });
  for (const patch of [{ bannerSlides: null }, { bannerInterval: null }, { bannerInterval: 2 }, { bannerInterval: 31 }, { bannerSlides: Array(11).fill(slide) }, { bannerSlides: [{ ...slide, title: ' ' }] }, { bannerSlides: [{ ...slide, imageUrl: 'javascript:alert(1)' }] }, { bannerSlides: [{ ...slide, privateToken: 'secret' }] }]) await assert.rejects(validate({ ...defaults, ...patch }), e => e.getStatus() === 400);
  for (const patch of [{ storeName: ' ' }, { contactEmail: 'javascript:bad' }, { role: 'ADMIN' }, { announcement: 'a'.repeat(501) }]) await assert.rejects(validate({ ...defaults, ...patch }), e => e.getStatus() === 400);
  let content;
  const service = new SettingsService({
    findOne: () => ({ lean: async () => content ? { content } : null }),
    findOneAndUpdate: (filter, data) => { assert.deepEqual(filter, { key: 'store' }); content = data.$set.content; return { lean: async () => ({ content }) }; },
  });
  assert.deepEqual(await service.get(), defaults);
  await service.save({ ...defaults, storeName: 'Minha loja' });
  assert.equal((await service.get()).storeName, 'Minha loja');
});

test('image upload requires ADMIN, validates content/size and serves stored bytes publicly', async () => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
  const upload = (bytes, type = 'image/png', authenticated = true) => {
    const data = new FormData(); data.append('image', new Blob([bytes], { type }), '../../original.png');
    return request('admin/product-images', { method: 'POST', headers: authenticated ? { Authorization: `Bearer ${token}` } : {}, body: data });
  };
  account = { active: true, role: 'CUSTOMER', email: 'test@example.com' };
  assert.equal((await upload(png, 'image/png', false)).status, 401);
  assert.equal((await upload(png)).status, 403);
  account.role = 'ADMIN';
  assert.equal((await upload(Buffer.from('<svg><script>alert(1)</script></svg>'))).status, 400);
  assert.equal((await upload(Buffer.alloc(5 * 1024 * 1024 + 1))).status, 413);
  assert.equal((await request('admin/product-images', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: new FormData() })).status, 400);
  const response = await upload(png, 'image/jpeg'); // Actual content determines extension and response MIME.
  assert.equal(response.status, 201, await response.clone().text());
  const { imageUrl } = await response.json();
  assert.match(imageUrl, /^\/api\/product-images\/[a-f0-9-]{36}\.png$/);
  const image = await fetch(`${base}${imageUrl}`);
  assert.equal(image.status, 200);
  assert.equal(image.headers.get('content-type'), 'image/png');
  assert.equal(image.headers.get('x-content-type-options'), 'nosniff');
  assert.deepEqual(Buffer.from(await image.arrayBuffer()), png);
  assert.equal((await request('product-images/not-a-file.png')).status, 404);
  assert.equal((await request('product-images/00000000-0000-0000-0000-000000000000.png')).status, 404);
  const service = new ProductImagesService(imageDirectory);
  await assert.rejects(service.read('../.env'), e => e.getStatus() === 404);
});

test('product image field supports uploaded paths, safe external URLs and removal', async () => {
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
  const product = { name: 'ESP32', sku: 'ESP-001', type: 'BOARD', price: 89.9, stock: 20 };
  const validate = imageUrl => pipe.transform({ ...product, imageUrl }, { type: 'body', metatype: CreateProductDto });
  for (const url of ['', 'https://example.com/image.jpg', 'http://localhost:3000/image.png', '/api/product-images/00000000-0000-0000-0000-000000000000.png']) assert.equal((await validate(url)).imageUrl, url);
  for (const url of ['javascript:alert(1)', 'data:image/png;base64,123', '//example.com/a.png', '/api/product-images/../.env', 'https://user:password@example.com/a.png', 'file:///etc/passwd', 'https://example.com/' + 'a'.repeat(2048)]) await assert.rejects(validate(url), e => e.getStatus() === 400);
});
