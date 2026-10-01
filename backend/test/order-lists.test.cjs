require('reflect-metadata');
const { test } = require('node:test'); const assert = require('node:assert/strict');
const { AdminService } = require('../dist/admin/admin.service');
test('paid and unpaid listings scope both rows and pagination counts', async () => {
 let filter, countFilter;
 const query = { select: () => query, sort: () => query, skip: () => query, limit: () => query, populate: () => query, lean: async () => [] };
 const orders = { find: f => { filter = f; return query; }, countDocuments: async f => { countFilter = f; return 0; } };
 const service = new AdminService({}, orders, {}, {}, {}, {}, {}, {});
 await service.listOrders({ page: 1, limit: 20, search: 'PENDING' });
 assert.deepEqual(filter.status, { $in: ['PAID', 'LABEL_ISSUED', 'SHIPPED', 'FULFILLED'] }); assert.deepEqual(countFilter, filter);
 await service.listUnpaidOrders({ page: 1, limit: 20 });
 assert.equal(filter.status, 'PENDING'); assert.deepEqual(countFilter, filter);
});
