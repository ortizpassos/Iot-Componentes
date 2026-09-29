import { test, expect } from '@playwright/test';
const id = '507f1f77bcf86cd799439012';
const long = 'Componente'.repeat(15);
const product = { _id: id, name: long, sku: long, type: 'BOARD', price: 89.9, stock: 20, programming: { supported: false } };
const order = { _id: id, status: 'PENDING', createdAt: '2026-09-01', total: 89.9, items: [{ productId: id, name: long, sku: long, quantity: 1, unitPrice: 89.9, total: 89.9, programmingRequest: { requested: false, type: 'NONE' } }] };
for (const width of [320, 390]) test('pages fit mobile ' + width, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 });
  await page.addInitScript(() => sessionStorage.setItem('iot-token', 'test-token'));
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    let json: any = {};
    if (path.endsWith('/users/me')) json = { name: long, role: 'ADMIN' };
    else if (path.endsWith('/admin/access')) json = { allowed: true };
    else if (path.includes('/admin/')) json = { items: [product], total: 1, page: 1, limit: 20 };
    else if (path.endsWith('/products')) json = [product];
    else if (path.endsWith('/products/' + id)) json = product;
    else if (path.endsWith('/orders')) json = [order];
    else if (path.endsWith('/orders/' + id)) json = order;
    else if (path.endsWith('/devices')) json = [{ _id: id, name: long, board: long }];
    else if (path.endsWith('/projects')) json = [{ _id: id, name: long, description: long, status: 'DRAFT' }];
    return route.fulfill({ json });
  });
  for (const path of ['/catalogo', '/produto/' + id, '/finalizar-compra/' + id, '/pedidos', '/pedidos/' + id, '/dispositivos', '/projetos', '/adm']) {
    await page.goto(path);
    await expect(page.locator('h1').first()).toBeVisible();
    if (path === '/adm') await expect(page.locator('.topbar')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), { message: path }).toBe(true);
    const content = page.locator(path === '/adm' ? '.admin-content' : 'main');
    expect(await content.evaluate(el => el.scrollWidth <= el.clientWidth), path).toBe(true);
  }
});
