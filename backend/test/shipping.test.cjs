require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { inflateSync } = require('node:zlib');
const { AdminService } = require('../dist/admin/admin.service');
const { shippingLabel } = require('../dist/admin/shipping-label');
const id = '507f1f77bcf86cd799439011';
const profile = { fullName: 'João da Silva', cpf: '52998224725', address: { zipCode: '01001000', street: 'Praça da Sé', number: '10', complement: 'Apto 2', neighborhood: 'Centro', city: 'São Paulo', state: 'SP' } };
const sender = { fullName: 'Loja Exemplo', address: { ...profile.address, street: 'Rua de Origem', number: '20' } };
function fixture(status = 'PAID') {
  const state = { status, checkoutProfile: structuredClone(profile) }; let changes = 0;
  const service = new AdminService({}, {
    findById: () => ({ populate: () => ({ lean: async () => structuredClone(state) }) }),
    updateOne: async (filter, update) => { if (state.status !== filter.status) return { modifiedCount: 0 }; Object.assign(state, update.$set); changes++; return { modifiedCount: 1 }; },
  }, {}, {}, {}, { getShippingSender: async () => structuredClone(sender) });
  return { service, state, changes: () => changes };
}
test('paid order produces a one-page PDF with snapshot address and transitions once, including retries', async () => {
  const f = fixture();
  const [pdf, retry] = await Promise.all([f.service.shipOrder(id), f.service.shipOrder(id)]);
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-'); assert.equal(retry.subarray(0, 5).toString(), '%PDF-');
  assert.equal(f.state.status, 'SHIPPED'); assert.ok(f.state.shippedAt instanceof Date); assert.equal(f.changes(), 1);
  const source = pdf.toString('latin1'); assert.match(source, /\/Count 1\b/); assert.match(source, /\/MediaBox \[0 0 283\.46 425\.2\]/);
  let decoded = '';
  for (const match of source.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    try { const stream = inflateSync(Buffer.from(match[1], 'latin1')).toString('latin1'); for (const hex of stream.matchAll(/<([0-9a-f]+)>/gi)) decoded += Buffer.from(hex[1], 'hex').toString('latin1'); } catch {}
  }
  for (const value of ['DESTINATÁRIO', 'REMETENTE', 'JOÃO DA SILVA', 'LOJA EXEMPLO', 'Praça da Sé, 10', 'Rua de Origem, 20', 'Apto 2', 'São Paulo - SP', '01001-000']) assert.ok(decoded.includes(value), value);
  assert.match(source, /\/Subtype \/Image/);
  assert.deepEqual(f.state.shippingSender, sender);
  assert.equal(decoded.includes(profile.cpf), false);
  f.service.settings.getShippingSender = async () => undefined; // reprints keep the sender captured when shipped
  await f.service.label(id); assert.equal(f.changes(), 1);
});
test('unpaid, cancelled and legacy completed orders cannot be shipped; incomplete address preserves paid status', async () => {
  for (const status of ['PENDING', 'CANCELLED', 'FULFILLED']) {
    const f = fixture(status); await assert.rejects(f.service.shipOrder(id), e => e.getStatus() === 409); assert.equal(f.changes(), 0);
  }
  const f = fixture(); delete f.state.checkoutProfile;
  await assert.rejects(f.service.shipOrder(id), e => e.getStatus() === 400); assert.equal(f.state.status, 'PAID'); assert.equal(f.changes(), 0);
  await assert.rejects(f.service.label(id), e => e.getStatus() === 409);
  await assert.rejects(f.service.orderStatus(id, 'SHIPPED'), e => e.getStatus() === 409);
});
test('concurrent cancellation prevents shipping, and long delivery fields fit one page', async () => {
  const f = fixture(); f.service.orders.updateOne = async () => { f.state.status = 'CANCELLED'; return { modifiedCount: 0 }; };
  await assert.rejects(f.service.shipOrder(id), e => e.getStatus() === 409); assert.equal(f.state.status, 'CANCELLED');
  const long = structuredClone(profile); long.fullName = 'Nome '.repeat(30).trim();
  long.address.street = 'Rua '.repeat(37); for (const field of ['complement', 'neighborhood', 'city']) long.address[field] = 'Texto '.repeat(16);
  const pdf = await shippingLabel(id, long, sender); assert.match(pdf.toString('latin1'), /\/Count 1\b/);
});

test('missing sender blocks shipping without changing order status', async () => {
  const f = fixture(); f.service.settings.getShippingSender = async () => undefined;
  await assert.rejects(f.service.shipOrder(id), e => e.getStatus() === 400 && e.message.includes('Remetente'));
  assert.equal(f.state.status, 'PAID'); assert.equal(f.changes(), 0);
});
