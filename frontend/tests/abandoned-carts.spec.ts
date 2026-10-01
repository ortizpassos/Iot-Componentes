import { profile } from './checkout-fixture';
import { test, expect } from '@playwright/test';
const product = { _id: '507f1f77bcf86cd799439011', name: 'Sensor teste', sku: 'S1', price: 12.5, stock: 5, type: 'SENSOR' };
async function mock(page: any, initial: any[] = []) {
  let items = initial;
  await page.route('**/api/**', async (route: any) => {
    const req = route.request(); const path = new URL(req.url()).pathname;
    if (path === '/api/products') return route.fulfill({ json: [product] });
    if (path === '/api/cart') {
      if (req.method() === 'PUT') { items = req.postDataJSON().items; return route.fulfill({ json: { saved: true } }); }
      return route.fulfill({ json: { lines: items.map(i => ({ product, quantity: i.quantity, type: i.type, requirements: i.requirements })) } });
    }
    if (path === '/api/users/me') return route.fulfill({ json: { name: 'Cliente', role: 'CUSTOMER' } });
    if (path === '/api/users/me/checkout-profile') return route.fulfill({ json: { profile: null } });
    if (path === '/api/admin/access') return route.fulfill({ json: { allowed: true } });
    if (path === '/api/admin/abandoned-carts') return route.fulfill({ json: { items: [{ _id: 'cart1', customer: { name: 'Cliente teste', email: 'cliente@example.com' }, lastActivityAt: '2026-10-01T10:00:00Z', total: 25, items: [{ ...product, productId: product._id, quantity: 2 }] }], total: 1 } });
    return route.fulfill({ json: { items: [], total: 0 } });
  });
  return () => items;
}
test('authenticated cart saves, restores after reload and clears on removal', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('iot-token', 'customer-token'));
  const saved = await mock(page);
  await page.goto('/catalogo');
  await page.getByRole('button', { name: 'Adicionar Sensor teste' }).click();
  await expect.poll(() => saved().length).toBe(1);
  await page.reload();
  await page.getByRole('link', { name: 'Carrinho, 1 itens', exact: true }).click();
  await expect(page.getByRole('heading', { name: product.name, exact: true })).toBeVisible();
  await page.getByLabel('Quantidade', { exact: true }).fill('3');
  await expect.poll(() => saved()[0].quantity).toBe(3);
  await page.getByRole('button', { name: 'Remover', exact: true }).click();
  await expect.poll(() => saved().length).toBe(0);
});
test('guest cart survives reload locally and logout hides authenticated cart', async ({ page }) => {
  await mock(page);
  await page.goto('/catalogo');
  await page.getByRole('button', { name: 'Adicionar Sensor teste' }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('iot-guest-cart-v1') || '[]').length)).toBe(1);
  await page.reload();
  await expect(page.getByRole('link', { name: 'Carrinho, 1 itens', exact: true })).toBeVisible();
  await page.evaluate(() => sessionStorage.setItem('iot-token', 'customer-token'));
  await page.reload();
  await expect(page.getByRole('link', { name: 'Carrinho, 1 itens', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Sair', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Carrinho, 0 itens', exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('iot-guest-cart-v1'))).toBe('[]');
});
test('admin lists abandoned carts with customer and items', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('iot-token', 'admin-token'));
  await mock(page);
  await page.goto('/adm');
  await page.getByRole('button', { name: 'Carrinhos abandonados', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Cliente teste' })).toBeVisible();
  await expect(page.getByText('cliente@example.com', { exact: true })).toBeVisible();
  await expect(page.getByText('Total estimado:', { exact: false })).toContainText('25,00');
});

test('registering an order clears the saved cart', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('iot-token', 'customer-token'));
  const saved = await mock(page, [{ productId: product._id, quantity: 1, type: 'NONE', requirements: '' }]);
  await page.route('**/api/users/me/checkout-profile', route => route.fulfill({ json: { profile } }));
  await page.route('**/api/shipping/quote', route => route.fulfill({ json: { services: [{ code: '1', name: 'PAC', price: 10, deliveryDays: 5 }] } }));
  await page.route('**/api/orders', route => route.fulfill({ json: { _id: product._id, items: route.request().postDataJSON().items } }));
  await page.goto('/carrinho');
  await expect(page.getByRole('radio', { name: /PAC/ })).toBeVisible();
  await page.getByRole('button', { name: /Registrar pedido/ }).click();
  await expect(page).toHaveURL('/pagamento/' + product._id);
  await expect.poll(() => saved().length).toBe(0);
});
