import { test, expect } from '@playwright/test';
import { profile } from './checkout-fixture';
const id = '507f1f77bcf86cd799439012';
const product = { _id: id, name: 'ESP32-S3 DevKit', sku: 'ESP32-001', type: 'BOARD', price: 89.9, stock: 20, programming: { supported: true } };
const user = { id: '507f1f77bcf86cd799439011', name: 'Eduardo', email: 'eduardo@teste.com', role: 'CUSTOMER' };
test('navbar categories filter the catalog and survive reload', async ({ page }) => {
  await page.route('**/api/products', route => route.fulfill({ json: [product, { ...product, _id: 'sensor', name: 'Sensor teste', type: 'SENSOR' }] }));
  await page.goto('/catalogo');
  const categories = page.getByRole('navigation', { name: 'Categorias de produtos' });
  await categories.getByRole('link', { name: 'Sensores', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sensor teste' })).toBeVisible();
  await expect(page.getByRole('heading', { name: product.name })).toHaveCount(0);
  await page.reload();
  await expect(categories.getByRole('link', { name: 'Sensores', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { name: product.name })).toHaveCount(0);
  await categories.getByRole('link', { name: 'Todos', exact: true }).click();
  await expect(page.getByRole('heading', { name: product.name })).toBeVisible();
  await page.getByLabel('Buscar produtos', { exact: true }).fill('Sensor teste');
  await page.getByRole('button', { name: 'Buscar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sensor teste' })).toBeVisible();
  await expect(page.getByRole('heading', { name: product.name })).toHaveCount(0);
  await page.reload();
  await expect(page.getByLabel('Buscar produtos', { exact: true })).toHaveValue('Sensor teste');
});
test('buy now checks out only the selected item and preserves the cart through login', async ({ page }) => {
  const other = { ...product, _id: 'other-product', name: 'Outro produto' };
  let submitted: any;
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/products') return route.fulfill({ json: [product, other] });
    if (path === '/api/auth/login') return route.fulfill({ json: { accessToken: 'test-token', user } });
    if (path === '/api/users/me') return route.fulfill({ json: user });
    if (path === '/api/users/me/checkout-profile') return route.fulfill({ json: { profile } });
    if (path === '/api/orders') {
      submitted = route.request().postDataJSON();
      return route.fulfill({ json: { _id: id, items: submitted.items } });
    }
    return route.fulfill({ status: 404, json: {} });
  });
  await page.goto('/catalogo');
  const cart = page.locator('.topbar .cart-link');
  await page.getByRole('button', { name: 'Adicionar ' + other.name, exact: true }).click();
  await page.getByRole('button', { name: 'Comprar agora ' + product.name, exact: true }).click();
  await expect(page).toHaveURL('/finalizar-compra/' + id);
  await expect(page.getByRole('heading', { name: 'Finalizar compra', exact: true })).toBeVisible();
  await expect(page.getByLabel('Quantidade')).toHaveValue('1');
  await expect(cart).toHaveAccessibleName('Carrinho, 1 itens');
  await page.getByRole('button', { name: 'Entrar para continuar' }).click();
  await page.getByLabel('E-mail').fill(user.email);
  await page.getByLabel('Senha').fill('12345678');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL('/finalizar-compra/' + id);
  await expect(page.getByRole('button', { name: 'Alterar dados de entrega' })).toBeVisible();
  await page.getByRole('button', { name: 'Ir para pagamento' }).click();
  await expect(page).toHaveURL('/pagamento/' + id);
  expect(submitted.items).toEqual([{ productId: id, quantity: 1, programmingRequest: { requested: false, type: 'NONE' } }]);
  await cart.click();
  await expect(page.getByRole('heading', { name: other.name, exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: product.name, exact: true })).toHaveCount(0);
  await page.getByLabel('Quantidade').fill('4');
  await expect(cart).toHaveAccessibleName('Carrinho, 4 itens');
  await page.getByRole('button', { name: 'Remover', exact: true }).click();
  await expect(cart).toHaveAccessibleName('Carrinho, 0 itens');
});
test('catalog, login and checkout send only API-owned input fields', async ({ page }) => {
  let submitted: unknown;
  const order = { _id: id, status: 'PENDING', total: 179.8, createdAt: '2026-09-25T12:00:00Z', items: [{ productId: id, name: product.name, sku: product.sku, quantity: 2, unitPrice: 89.9, total: 179.8, programmingRequest: { requested: true, type: 'CUSTOM', requirements: 'Acionar relé' } }] };
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/products') return route.fulfill({ json: [product] });
    if (path === '/api/auth/login') return route.fulfill({ json: { accessToken: 'test-token', user } });
    if (path === '/api/users/me') return route.fulfill({ json: user });
    if (path === '/api/users/me/checkout-profile') return route.fulfill({ json: { profile } });
    if (path === '/api/orders' && route.request().method() === 'POST') {
      expect(route.request().headers()['authorization']).toBe('Bearer test-token');
      submitted = route.request().postDataJSON(); return route.fulfill({ json: order });
    }
    if (path === `/api/orders/${id}`) return route.fulfill({ json: order });
    return route.fulfill({ status: 404, json: {} });
  });
  await page.goto('/catalogo');
  await page.getByRole('button', { name: 'Adicionar ESP32-S3 DevKit' }).click();
  await page.getByRole('link', { name: 'Carrinho, 1 itens' }).click();
  await page.getByLabel('Quantidade').fill('2');
  await page.getByRole('combobox', { name: 'Programação', exact: true }).selectOption('CUSTOM');
  await page.getByLabel('O que o dispositivo deve fazer?').fill('Acionar relé');
  await page.getByRole('button', { name: 'Entrar para continuar' }).click();
  await page.getByLabel('E-mail').fill(user.email);
  await page.getByLabel('Senha').fill('12345678');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL(/carrinho/);
  await expect(page.getByRole('button', { name: 'Alterar dados de entrega' })).toBeVisible();
  await page.getByRole('button', { name: 'Registrar pedido' }).click();
  await expect(page.getByRole('heading', { name: 'Detalhes do pedido' })).toBeVisible();
  expect(submitted).toEqual({ items: [{ productId: id, quantity: 2, programmingRequest: { requested: true, type: 'CUSTOM', requirements: 'Acionar relé' } }] });
  await expect(page.getByText('Pendente', { exact: true })).toBeVisible();
});

test('protected route and expired session redirect to login', async ({ page }) => {
  await page.goto('/pedidos');
  await expect(page).toHaveURL(/login/);
  await page.evaluate(() => sessionStorage.setItem('iot-token', 'expired'));
  await page.route('**/api/**', route => route.fulfill({ status: 401, json: { message: 'Unauthorized' } }));
  await page.goto('/pedidos');
  await expect(page.getByText('Sua sessão expirou. Entre novamente.')).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('iot-token'))).toBeNull();
});

test('catalog can recover from API failure and fits mobile viewport', async ({ page }) => {
  let failed = true;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/products', route => failed ? route.fulfill({ status: 503, json: {} }) : route.fulfill({ json: [product] }));
  await page.goto('/catalogo');
  await expect(page.getByRole('alert')).toContainText('Não foi possível acessar a API');
  failed = false;
  await page.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(page.getByRole('heading', { name: product.name })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/catalog-mobile.png', fullPage: true });
});
