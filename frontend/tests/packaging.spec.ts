import { test, expect } from '@playwright/test';
test('admin creates and edits reusable packaging', async ({ page }) => {
  const items: any[] = [];
  await page.addInitScript(() => sessionStorage.setItem('iot-token', 'admin-token'));
  await page.route('**/api/**', async route => {
    const req = route.request(); const path = new URL(req.url()).pathname;
    if (path === '/api/users/me') return route.fulfill({ json: { name: 'Admin', role: 'ADMIN' } });
    if (path === '/api/admin/access') return route.fulfill({ json: { allowed: true } });
    if (path === '/api/admin/summary') return route.fulfill({ json: {} });
    if (path === '/api/admin/packages') {
      if (req.method() === 'POST') items.push({ _id: '507f1f77bcf86cd799439011', ...req.postDataJSON() });
      return route.fulfill({ json: req.method() === 'GET' ? items : items[0] });
    }
    if (path.startsWith('/api/admin/packages/')) { items[0] = { ...items[0], ...req.postDataJSON() }; return route.fulfill({ json: items[0] }); }
    return route.fulfill({ json: { items: [], total: 0 } });
  });
  await page.goto('/adm');
  await page.getByRole('button', { name: 'Embalagens', exact: false }).click();
  await page.getByLabel('Nome da embalagem').fill('Caixa pequena');
  await page.getByLabel('Comprimento (cm)').fill('25');
  await page.getByRole('button', { name: 'Salvar embalagem' }).click();
  await expect(page.getByRole('heading', { name: 'Caixa pequena' })).toBeVisible();
  expect(items[0].lengthCm).toBe(25);
  await page.getByRole('button', { name: 'Editar embalagem' }).click();
  await page.getByLabel('Altura (cm)').fill('8');
  await page.getByRole('button', { name: 'Salvar embalagem' }).click();
  await expect(page.getByText('25 × 10 × 8 cm', { exact: false })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
