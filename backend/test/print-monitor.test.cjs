require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PrintMonitorService, PrintMonitorGuard } = require('../dist/admin/print-monitor');
const id = '507f1f77bcf86cd799439011';
const token = '3ea3c270-f574-462b-8896-453ffb29a8cd';
test('monitor credentials are required and distinct from customer tokens', () => {
  const guard = new PrintMonitorGuard({ get: () => 'x'.repeat(40) });
  const ctx = value => ({ switchToHttp: () => ({ getRequest: () => ({ headers: { 'x-print-token': value } }) }) });
  assert.throws(() => guard.canActivate(ctx(undefined)), e => e.getStatus() === 401);
  assert.throws(() => guard.canActivate(ctx('customer-jwt')), e => e.getStatus() === 401);
  assert.equal(guard.canActivate(ctx('x'.repeat(40))), true);
  assert.throws(() => new PrintMonitorGuard({ get: () => '' }).canActivate(ctx('')), e => e.getStatus() === 401);
});
test('claim requires provider approval, paid state and no previous print attempt', async () => {
  const service = new PrintMonitorService({ findOneAndUpdate: (filter, update) => {
    assert.deepEqual(filter, { status: 'PAID', 'payment.status': 'approved', printJob: { $exists: false } });
    assert.equal(update.$set.printJob.state, 'CLAIMED');
    return { select: () => ({ lean: async () => ({ _id: id, printJob: update.$set.printJob }) }) };
  } }, {});
  const job = await service.claim(); assert.equal(job.id, id); assert.match(job.token, /^[0-9a-f-]{36}$/);
});
test('accepted print issues label without shipping and duplicate receipts are idempotent', async () => {
  let done = false;
  const model = { updateOne: async (filter, update) => {
    assert.equal(filter.status, 'PAID'); assert.equal(filter['printJob.token'], token);
    assert.deepEqual(filter['printJob.state'], { $in: ['PRINTING'] });
    assert.equal(update.$set.status, 'LABEL_ISSUED'); assert.equal(update.$set.shippedAt, undefined);
    if (done) return { modifiedCount: 0 }; done = true; return { modifiedCount: 1 };
  }, exists: async filter => done && filter['printJob.state'] === 'DONE' };
  const service = new PrintMonitorService(model, {});
  await service.result(id, { token, result: 'accepted', message: '' });
  await service.result(id, { token, result: 'accepted', message: '' });
});
test('uncertain failures remain paid and cannot silently start another print', async () => {
  const service = new PrintMonitorService({ updateOne: async (filter, update) => {
    assert.equal(update.$set.status, undefined); assert.equal(update.$set['printJob.state'], 'ERROR');
    return { modifiedCount: 1 };
  } }, {});
  await service.result(id, { token, result: 'error', message: 'Timeout' });
  const blocked = new PrintMonitorService({ updateOne: async () => ({ modifiedCount: 0 }) }, {});
  await assert.rejects(blocked.start(id, token), e => e.getStatus() === 409);
});
