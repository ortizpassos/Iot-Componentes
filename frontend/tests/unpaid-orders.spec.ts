import { test, expect } from '@playwright/test';
test('unpaid orders can be manually paid and move to paid orders with label action', async ({ page }) => {
 const id = '507f1f77bcf86cd799439011'; let paid = false;
 const order = { _id: id, customer: { name: 'Cliente teste', email: 'cliente@example.com' }, total: 12, createdAt: '2026-10-01T10:00:00Z', items: [{ productId: id, name: 'Sensor', quantity: 1, unitPrice: 12, programmingRequest: { requested: false, type: 'NONE' } }] };
 await page.addInitScript(() => sessionStorage.setItem('iot-token', 'admin-token'));
 await page.route('**/api/**', route => {
  const path = new URL(route.request().url()).pathname;
  if (path === '/api/users/me') return route.fulfill({ json: { name: 'Admin', role: 'ADMIN' } });
  if (path === '/api/admin/access') return route.fulfill({ json: { allowed: true } });
  if (path === '/api/admin/orders/unpaid') return route.fulfill({ json: { items: paid ? [] : [{ ...order, status: 'PENDING' }], total: paid ? 0 : 1 } });
  if (path === '/api/admin/orders') return route.fulfill({ json: { items: paid ? [{ ...order, status: 'PAID' }] : [], total: paid ? 1 : 0 } });
  if (path === '/api/admin/orders/' + id + '/status') { expect(route.request().postDataJSON()).toEqual({ status: 'PAID' }); paid = true; return route.fulfill({ json: { ...order, status: 'PAID' } }); }
  return route.fulfill({ json: { items: [], total: 0, lines: [] } });
 });
 await page.goto('/adm');
 await page.getByRole('button', { name: 'Pedidos', exact: true }).click();
 await expect(page.getByRole('button', { name: 'Marcar como pago' })).toHaveCount(0);
 await page.getByRole('button', { name: 'Carrinhos abandonados', exact: true }).click();
 await expect(page.getByRole('heading', { name: /Pedido #.*Aguardando pagamento/ })).toBeVisible();
 await page.getByRole('button', { name: 'Marcar como pago' }).click();
 expect(paid).toBe(false);
 await page.getByRole('button', { name: 'Confirmar alteração' }).click();
 await expect(page.getByText('Nenhum pedido aguardando pagamento.')).toBeVisible();
 await page.getByRole('button', { name: 'Pedidos', exact: true }).click();
 await expect(page.getByRole('button', { name: 'Emitir etiqueta', exact: true })).toBeVisible();
});
