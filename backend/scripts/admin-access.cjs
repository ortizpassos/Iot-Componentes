// Grants access only to an existing account explicitly selected by the server operator.
const { resolve } = require('node:path');
const { existsSync } = require('node:fs');
const mongoose = require('mongoose');
const envPath = resolve(__dirname, '../.env');
if (existsSync(envPath)) process.loadEnvFile(envPath);
async function main() {
  const [action, input, ...extra] = process.argv.slice(2);
  if (!['grant', 'revoke'].includes(action) || !input?.includes('@') || extra.length) {
    throw new Error('Uso: npm run admin:access -- grant|revoke email@exemplo.com');
  }
  if (!process.env.MONGODB_URI) throw new Error('Configure MONGODB_URI no backend/.env.');
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  const email = input.trim().toLowerCase();
  const users = mongoose.connection.collection('users');
  const user = await users.findOne({ email });
  if (!user) throw new Error('Conta não encontrada. Cadastre o usuário antes de conceder acesso.');
  if (action === 'grant' && !user.active) throw new Error('A conta está desativada.');
  await users.updateOne({ _id: user._id }, { $set: { role: action === 'grant' ? 'ADMIN' : 'CUSTOMER', updatedAt: new Date() } });
  console.log(`Acesso administrativo ${action === 'grant' ? 'concedido' : 'revogado'} para ${email}.`);
}
main().catch(error => { console.error(error instanceof mongoose.Error ? 'Falha ao acessar o banco de dados.' : error.message); process.exitCode = 1; }).finally(() => mongoose.disconnect());
