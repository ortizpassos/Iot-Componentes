import { test, expect } from '@playwright/test';
for (const admin of [false, true]) {
  test('mobile sidebar ' + (admin ? 'admin' : 'store'), async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    if (admin) await page.addInitScript(() => sessionStorage.setItem('iot-token', 'admin-token'));
    await page.route('**/api/**', route => {
      const path = new URL(route.request().url()).pathname;
      const json = path.endsWith('/users/me') ? { name: 'Admin', role: 'ADMIN' }
        : path.endsWith('/admin/access') ? { allowed: true }
        : path.includes('/admin/') ? { items: [], total: 0, page: 1, limit: 20 }
        : path.endsWith('/products') ? [] : {};
      return route.fulfill({ json });
    });
    await page.goto(admin ? '/adm' : '/catalogo');
    if (admin) await expect(page.locator('.topbar')).toHaveCount(0);
    const menu = page.getByRole('dialog', { name: 'Menu lateral' });
    const trigger = page.getByRole('button', { name: 'Abrir menu' });
    await expect(menu).not.toBeVisible();
    await trigger.click();
    await expect(menu).toBeVisible();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Escape');
    await expect(menu).not.toBeVisible();
    await expect(trigger).toBeFocused();
    await trigger.click();
    await page.mouse.click(375, 400);
    await expect(menu).not.toBeVisible();
    await trigger.click();
    if (admin) await menu.getByRole('button', { name: /Pedidos/ }).click();
    else await menu.getByRole('link', { name: /Carrinho/ }).click();
    await expect(menu).not.toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(trigger).not.toBeVisible();
    await expect(page.locator('aside')).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(menu).not.toBeVisible();
    await trigger.click();
    await expect(menu).toBeVisible();
  });
}
