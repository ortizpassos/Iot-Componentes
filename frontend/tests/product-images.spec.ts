import { test, expect } from '@playwright/test';

const id = '507f1f77bcf86cd799439012';
const uploadUrl = '/api/product-images/00000000-0000-0000-0000-000000000001.png';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');

test('admin saves image links, uploads replacements and removes the image', async ({ page }) => {
  let saved: any;
  let uploadFails = true;
  await page.addInitScript(() => sessionStorage.setItem('iot-token', 'admin-token'));
  await page.route('https://images.example.com/product.png', route => route.fulfill({ contentType: 'image/png', body: png }));
  await page.route('**/api/**', async route => {
    const request = route.request(); const path = new URL(request.url()).pathname;
    if (path === '/api/users/me') return route.fulfill({ json: { name: 'Admin', role: 'ADMIN' } });
    if (path === '/api/admin/packages') return route.fulfill({ json: [{ _id: id, name: 'Caixa', lengthCm: 20, widthCm: 15, heightCm: 8 }] });
    if (path === '/api/admin/access') return route.fulfill({ json: { allowed: true } });
    if (path === '/api/admin/product-datasheets') return route.fulfill({ json: { datasheetUrl: '/api/product-datasheets/00000000-0000-0000-0000-000000000001.pdf' } });
    if (path === '/api/admin/summary') return route.fulfill({ json: { products: 1, activeProducts: 1, orders: 0, pendingOrders: 0, customers: 1, devices: 0, projects: 0 } });
    if (path === '/api/admin/product-images') {
      expect(request.headers()['authorization']).toBe('Bearer admin-token');
      expect(request.headers()['content-type']).toContain('multipart/form-data; boundary=');
      expect(request.postDataBuffer()?.includes(png)).toBe(true);
      return uploadFails ? route.fulfill({ status: 400, json: { message: 'Envie uma imagem válida.' } }) : route.fulfill({ json: { imageUrl: uploadUrl } });
    }
    if (path === uploadUrl) return route.fulfill({ contentType: 'image/png', body: png });
    if (path === '/api/admin/products' && request.method() === 'POST' || path === `/api/admin/products/${id}` && request.method() === 'PUT') {
      saved = { _id: id, ...request.postDataJSON() }; return route.fulfill({ json: saved });
    }
    if (path === '/api/admin/products') return route.fulfill({ json: { items: saved ? [saved] : [], total: saved ? 1 : 0 } });
    if (path === '/api/products') return route.fulfill({ json: saved ? [saved] : [] });
    return route.fulfill({ status: 404, json: {} });
  });
  await page.goto('/adm');
  await page.getByRole('button', { name: 'Cadastrar componente' }).click();
  await page.getByLabel('Nome', { exact: true }).fill('Placa com foto');
  await page.getByLabel('SKU').fill('IMAGE-001');
  await page.getByLabel('Peso do item (g)').fill('90');
  await page.getByLabel('Enviar datasheet PDF (até 10 MB)').setInputFiles({ name: 'datasheet.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%%EOF') });
  await expect(page.getByRole('link', { name: 'Baixar datasheet cadastrado' })).toBeVisible();
  await page.getByRole('button', { name: 'Adicionar referência' }).click();
  await page.getByLabel('Título da referência 1').fill('Fabricante');
  await page.getByLabel('Link da referência 1').fill('https://example.com/manual');
  await page.getByLabel('Link da imagem', { exact: true }).fill('https://images.example.com/product.png');
  await expect(page.getByRole('img', { name: 'Prévia de Placa com foto' })).toBeVisible();
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page.getByText('Alteração salva.')).toBeVisible();
  expect(saved.imageUrl).toBe('https://images.example.com/product.png');
  expect(saved.datasheetUrl).toMatch(/\.pdf$/);
  expect(saved.references).toEqual([{ label: 'Fabricante', url: 'https://example.com/manual' }]);
  await page.getByRole('button', { name: 'Editar', exact: true }).click();
  await expect(page.getByLabel('Link da imagem', { exact: true })).toHaveValue(saved.imageUrl);
  await expect(page.getByLabel('Link da referência 1')).toHaveValue('https://example.com/manual');
  const file = { name: 'component.png', mimeType: 'image/png', buffer: png };
  await page.getByLabel('Enviar imagem', { exact: true }).setInputFiles(file);
  await expect(page.getByRole('alert')).toContainText('Envie uma imagem válida.');
  await expect(page.getByLabel('Link da imagem', { exact: true })).toHaveValue(saved.imageUrl);
  uploadFails = false;
  await page.getByLabel('Enviar imagem', { exact: true }).setInputFiles(file);
  await expect(page.getByText('Imagem enviada. Salve o componente para aplicar.')).toBeVisible();
  await expect(page.getByLabel('Link da imagem', { exact: true })).toHaveValue(uploadUrl);
  for (let i = 2; i <= 5; i++) {
    await page.getByRole('button', { name: 'Adicionar outra imagem' }).click();
    await page.getByLabel('Link da imagem ' + i, { exact: true }).fill('https://images.example.com/product.png');
  }
  await expect(page.getByRole('button', { name: 'Adicionar outra imagem' })).toBeDisabled();
  await page.getByLabel('Enviar imagem 2', { exact: true }).setInputFiles(file);
  await expect(page.getByLabel('Link da imagem 2', { exact: true })).toHaveValue(uploadUrl);
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page.getByText('Alteração salva.')).toBeVisible();
  expect(saved.imageUrl).toBe(uploadUrl);
  expect(saved.additionalImageUrls).toHaveLength(4);
  expect(saved.additionalImageUrls[0]).toBe(uploadUrl);
  await page.getByRole('link', { name: 'Visualizar loja' }).click();
  await expect(page.getByRole('img', { name: 'Placa com foto', exact: true })).toHaveAttribute('src', uploadUrl);
  await page.reload();
  await expect(page.getByRole('img', { name: 'Placa com foto', exact: true })).toBeVisible();
  await page.goto('/adm');
  await page.getByRole('button', { name: 'Editar', exact: true }).click();
  await page.getByRole('button', { name: 'Remover imagem', exact: true }).click();
  await expect(page.getByLabel('Link da imagem 2', { exact: true })).toHaveValue(uploadUrl);
  await page.getByRole('button', { name: 'Remover imagem 2', exact: true }).click();
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page.getByText('Alteração salva.')).toBeVisible();
  expect(saved.imageUrl).toBe('');
  expect(saved.additionalImageUrls).toHaveLength(3);
});

test('catalog retains a placeholder when a remote image is unavailable', async ({ page }) => {
  await page.route('**/api/products', route => route.fulfill({ json: [{ _id: id, name: 'Sensor', sku: 'S-1', price: 10, stock: 1, type: 'SENSOR', imageUrl: 'https://images.example.com/missing.png' }] }));
  await page.route('https://images.example.com/missing.png', route => route.fulfill({ status: 404, body: '' }));
  await page.goto('/catalogo');
  await expect(page.getByRole('img', { name: 'Imagem indisponível' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Adicionar Sensor' })).toBeVisible();
});
