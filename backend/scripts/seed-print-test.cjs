// Run only inside the isolated print-test compose project. No real payment is made.
require('reflect-metadata');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const { OrderSchema } = require('../dist/orders/schemas/order.schema');
const { PaymentsService } = require('../dist/payments/payments.service');
const { StoreSettingsSchema } = require('../dist/settings/settings.module');
async function main() {
  if (process.env.MONGODB_URI !== 'mongodb://database:27017/iot_platform_print_test') throw Error('Use somente o compose de teste isolado.');
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection;
  const adminId = new mongoose.Types.ObjectId('507f1f77bcf86cd799439091');
  const id = new mongoose.Types.ObjectId('507f1f77bcf86cd799439092');
  await db.collection('users').updateOne({ _id: adminId }, { $setOnInsert: { name: 'Administrador de teste', email: 'admin@teste.local', password: await bcrypt.hash('TesteEtiqueta123!', 12), role: 'ADMIN', active: true, createdAt: new Date() } }, { upsert: true });
  const address = { zipCode: '01001000', street: 'Rua de Teste - SEM VALIDADE', number: '10', neighborhood: 'Centro', city: 'Sao Paulo', state: 'SP' };
  const settings = mongoose.model('StoreSettings', StoreSettingsSchema);
  await settings.updateOne({ key: 'store' }, { $set: { shippingSender: { fullName: 'LOJA TESTE - NAO POSTAR', address } } }, { upsert: true });
  const orders = mongoose.model('Order', OrderSchema);
  // Never requeue a previous print by running this setup again.
  await orders.updateOne({ _id: id }, { $setOnInsert: {
    customer: adminId, status: 'PENDING', total: 20,
    checkoutProfile: { fullName: 'DESTINATARIO TESTE - NAO POSTAR', cpf: '52998224725', address },
    items: [{ productId: new mongoose.Types.ObjectId(), sku: 'TESTE-IMPRESSAO', name: 'Componente ficticio', quantity: 1, unitPrice: 20, total: 20, programmingRequest: { requested: false, type: 'NONE' } }],
    payment: { key: 'print-test', method: 'pix', status: 'pending' },
  } }, { upsert: true });
  const payments = new PaymentsService(orders, null, null, null, null);
  await payments.apply({ id: '999000001', external_reference: `${id}:print-test`, status: 'approved', currency_id: 'BRL', transaction_amount: 20, date_last_updated: new Date().toISOString() });
  console.log('Pedido ficticio preparado: ' + id + '. Nenhuma cobranca realizada.');
}
main().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => mongoose.disconnect());
