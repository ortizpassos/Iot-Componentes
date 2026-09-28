import { test, expect } from '@playwright/test';
test('admin saves store sender independently of public settings and reloads the address', async ({ page }) => {
  let sender: any = null; let writes = 0;
  await page.addInitScript(() => sessionStorage.setItem('iot-token', 'admin'));
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/settings/shipping-sender') {
      expect(route.request().headers()['authorization']).toBe('Bearer admin');
      if (route.request().method() === 'PUT') { sender = route.request().postDataJSON(); writes++; }
      return route.fulfill({ json: { sender } });
    }
    if (path === '/api/settings') return route.fulfill({ json: { storeName: 'Loja Teste' } });
    if (path === '/api/users/me') return route.fulfill({ json: { name: 'Admin', role: 'ADMIN' } });
    if (path === '/api/admin/access') return route.fulfill({ json: { allowed: true } });
    if (path === '/api/admin/summary') return route.fulfill({ json: {} });
    if (path === '/api/admin/products') return route.fulfill({ json: { items: [], total: 0 } });
    return route.fulfill({ status: 404, json: {} });
  });
  await page.goto('/adm'); await page.getByRole('button', { name: 'Configurações do site' }).click();
  await page.getByRole('button', { name: 'Salvar dados do remetente' }).click(); expect(writes).toBe(0);
  await expect(page.getByText('Preencha os campos obrigatórios do remetente', { exact: false })).toBeVisible();
  await page.getByLabel('Nome da loja / remetente').fill('Minha Loja');
  await page.getByLabel('CEP do remetente').fill('01001-000');
  await page.getByLabel('Rua / Avenida do remetente').fill('Rua Teste');
  await page.getByLabel('Número do remetente').fill('100');
  await page.getByLabel('Bairro do remetente').fill('Centro');
  await page.getByLabel('Cidade do remetente').fill('São Paulo');
  await page.getByLabel('Estado do remetente').selectOption('SP');
  await page.getByRole('button', { name: 'Salvar dados do remetente' }).click();
  await expect(page.getByText('Dados do remetente salvos.')).toBeVisible();
  expect(sender.fullName).toBe('Minha Loja'); expect(sender.address.zipCode).toBe('01001000'); expect(writes).toBe(1);
  await page.reload(); await page.getByRole('button', { name: 'Configurações do site' }).click();
  await expect(page.getByLabel('Rua / Avenida do remetente')).toHaveValue('Rua Teste');
});
