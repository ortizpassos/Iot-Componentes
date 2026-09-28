import { test, expect } from '@playwright/test';

test('admin publishes image and notice slides, storefront rotates and pauses', async ({ page }) => {
  let settings: any = { storeName: 'Loja', tagline: '', catalogTitle: 'Catálogo', catalogDescription: '', bannerTitle: 'Padrão', bannerDescription: '', announcement: '', contactEmail: '', bannerSlides: [], bannerInterval: 3 };
  await page.addInitScript(() => sessionStorage.setItem('iot-token', 'admin'));
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/settings') { if (route.request().method() === 'PUT') settings = route.request().postDataJSON(); return route.fulfill({ json: settings }); }
    if (path === '/api/settings/shipping-sender') return route.fulfill({ json: { sender: null } });
    if (path === '/api/users/me') return route.fulfill({ json: { name: 'Admin', role: 'ADMIN' } });
    if (path === '/api/admin/access') return route.fulfill({ json: { allowed: true } });
    if (path === '/api/admin/summary') return route.fulfill({ json: {} });
    if (path === '/api/admin/products') return route.fulfill({ json: { items: [], total: 0 } });
    if (path === '/api/admin/product-images') return route.fulfill({ json: { imageUrl: '/api/product-images/12345678-1234-1234-1234-123456789012.png' } });
    if (path.startsWith('/api/product-images/')) return route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64') });
    if (path === '/api/products') return route.fulfill({ json: [] });
    return route.fulfill({ status: 404, json: {} });
  });
  await page.goto('/adm'); await page.getByRole('button', { name: 'Configurações do site' }).click();
  await page.getByLabel('Aviso aos clientes').fill('Entrega especial nesta semana');
  await page.getByRole('button', { name: 'Adicionar slide' }).click();
  await expect(page.getByRole('button', { name: 'Publicar configurações' })).toBeEnabled();
  await page.getByRole('button', { name: 'Publicar configurações' }).click();
  await expect(page.getByRole('alert')).toContainText('Slide 1: título: preencha este campo.');
  expect(settings.bannerSlides).toHaveLength(0);
  await page.getByLabel('Título do slide').fill('Novas placas');
  await page.getByLabel('Aviso ou descrição').fill('Conheça o catálogo');
  await page.getByLabel('Enviar imagem').setInputFiles({ name: 'banner.png', mimeType: 'image/png', buffer: Buffer.from('image') });
  await expect(page.getByLabel('Link da imagem')).toHaveValue(/product-images/);
  await page.getByRole('button', { name: 'Adicionar slide' }).click();
  await page.getByLabel('Título do slide').nth(1).fill('Serviços');
  await page.getByRole('button', { name: 'Mover para cima' }).nth(1).click();
  await page.getByRole('button', { name: 'Publicar configurações' }).click();
  await expect(page.getByText('Configurações publicadas na loja.')).toBeVisible();
  expect(settings.bannerSlides.map((s: any) => s.title)).toEqual(['Serviços', 'Novas placas']);
  await page.goto('/catalogo');
  const banner = page.locator('app-store-banner');
  await expect(banner.getByText('Entrega especial nesta semana')).toBeVisible();
  await expect(banner.getByRole('heading', { name: 'Serviços' })).toBeVisible({ timeout: 5000 });
  await banner.getByRole('button', { name: 'Próximo banner' }).click();
  await expect(banner.getByRole('heading', { name: 'Novas placas' })).toBeVisible();
  await expect(banner.locator('img')).toBeVisible();
  await expect(banner.getByRole('button', { name: 'Retomar rotação' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
