import { test, expect } from '@playwright/test';
const id = '507f1f77bcf86cd799439012';

test('admin is not linked publicly and requires explicit server permission', async ({ page }) => {
  await page.route('**/api/products', route => route.fulfill({ json: [] }));
  await page.goto('/catalogo');
  await expect(page.locator('a[href="/adm"]')).toHaveCount(0);
  await page.goto('/adm');
  await expect(page).toHaveURL(/login.*returnUrl=%2Fadm/);
  await page.evaluate(() => sessionStorage.setItem('iot-token', 'customer-token'));
  await page.route('**/api/users/me', route => route.fulfill({ json: { name: 'Cliente', role: 'CUSTOMER' } }));
  await page.route('**/api/admin/access', route => route.fulfill({ status: 403, json: { message: 'Forbidden' } }));
  await page.goto('/adm');
  await expect(page.getByRole('heading', { name: 'Acesso restrito' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cadastrar componente' })).toHaveCount(0);
});

test('authorized administrator creates and edits products and confirms order status changes', async ({ page }) => {
  const products: object[] = [];
  let productBody: any; let statusBody: unknown;
  await page.addInitScript(() => sessionStorage.setItem('iot-token', 'admin-token'));
  await page.route('**/api/**', async route => {
    const req = route.request(); const path = new URL(req.url()).pathname;
    if (path.startsWith('/api/admin/')) expect(req.headers()['authorization']).toBe('Bearer admin-token');
    if (path === '/api/settings/shipping-sender') return route.fulfill({ json: { sender: null } });
    if (path === '/api/users/me') return route.fulfill({ json: { name: 'Admin', role: 'ADMIN' } });
    if (path === '/api/admin/access') return route.fulfill({ json: { allowed: true } });
    if (path === '/api/admin/summary') return route.fulfill({ json: { products: 1, activeProducts: 1, orders: 1, pendingOrders: 1, customers: 2, devices: 0, projects: 0 } });
    if (path === '/api/admin/products' && req.method() === 'POST') { productBody = req.postDataJSON(); products.push({ _id: id, ...productBody }); return route.fulfill({ json: products[0] }); }
    if (path === `/api/admin/products/${id}` && req.method() === 'PUT') { productBody = req.postDataJSON(); products[0] = { _id: id, ...productBody }; return route.fulfill({ json: products[0] }); }
    if (path === '/api/admin/products') return route.fulfill({ json: { items: products, page: 1, limit: 20, total: products.length } });
    if (path === '/api/admin/orders') return route.fulfill({ json: { items: [{ _id: id, status: 'PENDING', total: 89.9, customer: { name: 'Cliente', email: 'cliente@test.com' } }], total: 1 } });
    if (path === `/api/admin/orders/${id}/status`) { statusBody = req.postDataJSON(); return route.fulfill({ json: { _id: id, status: 'PAID' } }); }
    return route.fulfill({ status: 404, json: {} });
  });
  await page.goto('/adm');
  await expect(page.getByRole('heading', { name: 'Administração' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Navegação administrativa' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Navegação principal', exact: true })).toHaveCount(0);
  await expect(page.locator('nav a[href="/adm"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Cadastrar componente' }).click();
  await page.getByLabel('Nome', { exact: true }).fill('ESP32');
  await page.getByLabel('SKU', { exact: true }).fill('ESP-001');
  await page.getByLabel('Descrição', { exact: true }).fill('Placa de desenvolvimento com Wi-Fi e Bluetooth.');
  await page.getByLabel('Preço (R$)').fill('89.9');
  await page.getByLabel('Estoque', { exact: true }).fill('20');
  await page.getByLabel('Parcelamento no cartão (condição desejada)').selectOption('SELLER');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Alteração salva.' })).toHaveText('Alteração salva.');
  expect(productBody.stock).toBe(20);
  expect(productBody.installmentFeePayer).toBe('SELLER');
  expect(productBody.description).toBe('Placa de desenvolvimento com Wi-Fi e Bluetooth.');
  expect(productBody.price).toBe(89.9);
  expect(productBody.active).toBe(true);
  await page.getByRole('button', { name: 'Editar', exact: true }).click();
  await expect(page.getByLabel('Parcelamento no cartão (condição desejada)')).toHaveValue('SELLER');
  await page.getByLabel('Parcelamento no cartão (condição desejada)').selectOption('BUYER');
  await expect(page.getByLabel('Descrição', { exact: true })).toHaveValue('Placa de desenvolvimento com Wi-Fi e Bluetooth.');
  await page.getByLabel('Preço (R$)').fill('99.9');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Alteração salva.' })).toHaveText('Alteração salva.');
  expect(productBody.price).toBe(99.9);
  expect(productBody.installmentFeePayer).toBe('BUYER');
  await page.getByRole('button', { name: 'Pedidos', exact: true }).click();
  await page.getByRole('button', { name: 'Marcar como pago', exact: true }).click();
  expect(statusBody).toBeUndefined();
  await page.getByRole('button', { name: 'Confirmar alteração' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Alteração salva.' })).toHaveText('Alteração salva.');
  expect(statusBody).toEqual({ status: 'PAID' });
});

test('admin login opens dedicated panel, deletion is confirmed and settings reach the storefront', async ({ page }) => {
  let removed = false;
  let settings = {
    storeName: 'IoT Lab', tagline: 'Da ideia ao dispositivo.', catalogTitle: 'Componentes para suas ideias.',
    catalogDescription: 'Encontre a próxima peça do seu projeto.', bannerTitle: 'Pequenos componentes.',
    bannerDescription: 'Escolha sua placa.', announcement: '', contactEmail: '',
  };
  await page.route('**/api/**', async route => {
    const req = route.request(); const path = new URL(req.url()).pathname;
    if (path === '/api/auth/login') return route.fulfill({ json: { accessToken: 'admin-token', user: { name: 'Admin', role: 'ADMIN' } } });
    if (path === '/api/settings/shipping-sender') return route.fulfill({ json: { sender: null } });
    if (path === '/api/users/me') return route.fulfill({ json: { name: 'Admin', role: 'ADMIN' } });
    if (path === '/api/admin/access') return route.fulfill({ json: { allowed: true } });
    if (path === '/api/settings') { if (req.method() === 'PUT') { expect(req.headers()['authorization']).toBe('Bearer admin-token'); settings = req.postDataJSON(); } return route.fulfill({ json: settings }); }
    if (path === `/api/admin/products/${id}` && req.method() === 'DELETE') { removed = true; return route.fulfill({ json: { deleted: true } }); }
    if (path === '/api/admin/products') return route.fulfill({ json: { items: removed ? [] : [{ _id: id, name: 'Sensor de teste', sku: 'TEST', price: 15, stock: 1, active: true }], total: removed ? 0 : 1 } });
    if (path === '/api/products') return route.fulfill({ json: [] });
    if (path === '/api/admin/summary') return route.fulfill({ json: { products: 1, activeProducts: 1, orders: 0, pendingOrders: 0, customers: 1, devices: 0, projects: 0 } });
    return route.fulfill({ status: 404, json: {} });
  });
  await page.goto('/login');
  await page.getByLabel('E-mail').fill('admin@example.com');
  await page.getByLabel('Senha').fill('test-password');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL(/\/adm$/);
  await expect(page.getByRole('navigation', { name: 'Navegação administrativa' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Meus pedidos/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Excluir', exact: true }).click();
  expect(removed).toBe(false);
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  expect(removed).toBe(false);
  await page.getByRole('button', { name: 'Excluir', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar alteração' }).click();
  await expect(page.getByText('Nenhum registro encontrado.')).toBeVisible();
  expect(removed).toBe(true);
  await page.getByRole('button', { name: 'Configurações do site', exact: true }).click();
  await page.getByLabel('Nome da loja', { exact: true }).fill('Loja de componentes');
  await page.getByLabel('Título do catálogo', { exact: true }).fill('Monte seu projeto');
  await page.getByLabel('Aviso aos clientes (opcional)').fill('Novos sensores disponíveis');
  await page.getByLabel('E-mail de contato').fill('contato@example.com');
  await page.getByRole('button', { name: 'Publicar configurações' }).click();
  await expect(page.getByText('Configurações publicadas na loja.')).toBeVisible();
  await page.getByRole('link', { name: 'Visualizar loja' }).click();
  await expect(page.getByRole('heading', { name: 'Monte seu projeto' })).toBeVisible();
  await expect(page.getByText('Novos sensores disponíveis')).toBeVisible();
  await expect(page.getByRole('link', { name: 'contato@example.com' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Monte seu projeto' })).toBeVisible();
  await page.goto('/adm');
  await page.screenshot({ path: 'test-results/admin-panel.png', fullPage: true });
});
