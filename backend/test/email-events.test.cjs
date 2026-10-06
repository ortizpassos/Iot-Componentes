require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EmailEventsService } = require('../dist/email/email-events.module');

test('email events are persisted in MongoDB without requiring SMTP during the request', async () => {
  let saved;
  const jobs = { create: async value => { saved = value; return value; } };
  const service = new EmailEventsService(jobs, { get: () => undefined });
  await service.publish({ type: 'customer.registered', email: ' Cliente@Example.com ', name: 'Cliente' });
  assert.equal(saved.type, 'customer.registered');
  assert.equal(saved.recipient, 'cliente@example.com');
  assert.equal(saved.state, 'PENDING');
  assert.equal(saved.attempts, 0);
  assert.ok(saved.eventId);
  assert.ok(saved.nextAttemptAt instanceof Date);
});

test('email templates include payment and Correios tracking details', () => {
  const service = new EmailEventsService({}, { get: () => undefined });
  const paid = service.message({ type: 'order.paid', email: 'a@b.com', name: 'José', orderId: '1234567890', total: 19.9 });
  assert.match(paid.subject, /34567890/);
  assert.match(paid.text, /R\$\s*19,90/);
  const shipped = service.message({ type: 'order.shipped', email: 'a@b.com', name: 'José', orderId: '1234567890', trackingCode: 'nn405178567br' });
  assert.match(shipped.text, /NN405178567BR/);
  assert.match(shipped.text, /rastreamento\.correios\.com\.br/);
});
