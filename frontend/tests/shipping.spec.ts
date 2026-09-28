import { test, expect } from '@playwright/test';
import { profile } from './checkout-fixture';

test('paid order downloads label, displays shipped status and allows reprint; errors keep status', async ({ page }) => {
  const id = '507f1f77bcf86cd799439012';
  let status = 'PAID'; let failed = true; let ships = 0; let reprints = 0;
  await page.addInitScript(() => sessionStorage.setItem('iot-token', 'admin-token'));
  await page.route('**/api/**', route => {
    const request = route.request(); const path = new URL(request.url()).pathname;
    const order = { _id: id, status, total: 89.9, createdAt: '2026-09-26T12:00:00Z', checkoutProfile: profile, items: [], customer: { name: profile.fullName } };
    if (path === '/api/users/me') return route.fulfill({ json: { name: 'Admin', role: 'ADMIN' } });
    if (path === '/api/admin/access') return route.fulfill({ json: { allowed: true } });
    if (path === '/api/admin/summary') return route.fulfill({ json: {} });
    if (path === '/api/admin/products') return route.fulfill({ json: { items: [], total: 0 } });
    if (path === '/api/admin/orders') return route.fulfill({ json: { items: [order], total: 1 } });
    if (path === `/api/admin/orders/${id}/ship`) {
      expect(request.method()).toBe('POST'); expect(request.headers()['authorization']).toBe('Bearer admin-token'); ships++;
      if (failed) return route.fulfill({ status: 400, json: { message: 'O pedido não possui dados de entrega completos.' } });
      status = 'SHIPPED'; return route.fulfill({ contentType: 'application/pdf', body: '%PDF-1.3\nshipping-test\n%%EOF' });
    }
    if (path === `/api/admin/orders/${id}/shipping-label`) { expect(request.method()).toBe('GET'); reprints++; return route.fulfill({ contentType: 'application/pdf', body: '%PDF-1.3\nshipping-test\n%%EOF' }); }
    if (path === `/api/orders/${id}`) return route.fulfill({ json: order });
    return route.fulfill({ status: 404, json: {} });
  });
  await page.goto('/adm'); await page.getByRole('button', { name: 'Pedidos', exact: true }).click();
  await page.getByRole('button', { name: 'Concluído · gerar etiqueta' }).click();
  expect(ships).toBe(0);
  await page.getByRole('button', { name: 'Confirmar alteração' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'O pedido não possui' })).toContainText('dados de entrega completos'); expect(status).toBe('PAID');
  failed = false;
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Confirmar alteração' }).click();
  expect((await download).suggestedFilename()).toBe(`etiqueta-${id}.pdf`);
  await expect(page.getByText('Enviado', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Concluído · gerar etiqueta' })).toHaveCount(0);
  const reprint = page.waitForEvent('download'); await page.getByRole('button', { name: 'Baixar etiqueta' }).click();
  expect((await reprint).suggestedFilename()).toBe(`etiqueta-${id}.pdf`); expect(reprints).toBe(1); expect(ships).toBe(2);
  await page.goto(`/pedidos/${id}`); await expect(page.getByText('Enviado', { exact: true })).toBeVisible();
});
