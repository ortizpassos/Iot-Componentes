import { test, expect } from '@playwright/test';
import { profile } from './checkout-fixture';
const id = '507f1f77bcf86cd799439012';
const product = { _id: id, name: 'ESP32 sem programação', sku: 'ESP-1', type: 'BOARD', price: 89.9, stock: 20, programming: { supported: true } };
const payer = { email: 'cliente@example.com', identification: { type: 'CPF', number: '12345678909' } };
const order = { _id: id, status: 'PENDING', total: 89.9, items: [{ productId: id, name: product.name, quantity: 1, unitPrice: 89.9, total: 89.9, programmingRequest: { requested: false, type: 'NONE' } }] };

test('pending Pix can be cancelled through confirmation to choose card', async ({ page }) => {
  let changed = false;
  await page.addInitScript(() => sessionStorage.setItem('iot-token', 'customer'));
  await page.route('https://sdk.mercadopago.com/js/v2', route => route.fulfill({ contentType: 'application/javascript', body: 'window.MercadoPago = class { bricks() { return { create: async () => ({ unmount: async () => {} }) }; } };' }));
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/change-method')) changed = true;
    if (path === '/api/payments/' + id || path.endsWith('/change-method')) return route.fulfill({ json: { orderId: id, total: 89.9, orderStatus: 'PENDING', eligible: true, canPay: changed, checkoutProfile: profile, payment: { status: changed ? 'cancelled' : 'pending', method: 'pix', qrCode: 'old-pix' } } });
    if (path === '/api/payments/config') return route.fulfill({ json: { enabled: true, publicKey: 'TEST-key' } });
    if (path === '/api/payments/saved-card') return route.fulfill({ json: { card: null, customerId: null } });
    return route.fulfill({ json: {} });
  });
  await page.goto('/pagamento/' + id);
  await page.getByRole('button', { name: 'Alterar meio de pagamento' }).click();
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  expect(changed).toBe(false);
  await page.getByRole('button', { name: 'Alterar meio de pagamento' }).click();
  await page.getByRole('button', { name: 'Confirmar alteração' }).click();
  await expect(page.getByLabel('Pix copia e cola')).toHaveCount(0);
  await page.getByRole('button', { name: 'Cartão', exact: true }).click();
  await expect(page.locator('#card-payment')).toBeAttached();
  expect(changed).toBe(true);
});

test('returning customer sees default card, submits fresh token and can forget preference', async ({ page }) => {
  let sent: any; let removed = false;
  await page.addInitScript(() => sessionStorage.setItem('iot-token', 'customer'));
  await page.route('https://sdk.mercadopago.com/js/v2', route => route.fulfill({ contentType: 'application/javascript', body: `
    window.MercadoPago = class { bricks() { return { create: async (type, id, options) => {
      window.brickOptions = options; const host = document.getElementById(id); host.innerHTML = '';
      const button = document.createElement('button'); button.textContent = 'Confirmar cartão salvo';
      button.onclick = () => options.callbacks.onSubmit({ formData: { token: 'fresh-cvv-token', payment_method_id: 'visa', installments: 1, payer: { type: 'customer', id: 'owned-customer', email: '${payer.email}' } } });
      host.appendChild(button); options.callbacks.onReady(); return { unmount: async () => { host.innerHTML = ''; } };
    } }; } };` }));
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/users/me') return route.fulfill({ json: { name: profile.fullName, email: payer.email, role: 'CUSTOMER' } });
    if (path === '/api/payments/config') return route.fulfill({ json: { enabled: true, publicKey: 'TEST-key' } });
    if (path === '/api/payments/saved-card') {
      if (route.request().method() === 'DELETE') { removed = true; return route.fulfill({ json: { removed: true } }); }
      return route.fulfill({ json: removed ? { customerId: null, card: null } : { customerId: 'owned-customer', card: { id: 'owned-card', brand: 'visa', lastFour: '1234' } } });
    }
    if (path === '/api/payments/' + id) {
      if (route.request().method() === 'POST') sent = route.request().postDataJSON();
      return route.fulfill({ json: { orderId: id, total: 89.9, orderStatus: sent ? 'PAID' : 'PENDING', eligible: !sent, canPay: !sent, checkoutProfile: profile, payment: sent ? { status: 'approved', method: 'card' } : null } });
    }
    return route.fulfill({ status: 404, json: {} });
  });
  await page.goto('/pagamento/' + id);
  await expect(page.getByText('Cartão padrão: visa · final 1234')).toBeVisible();
  const options: any = await page.evaluate(() => (window as any).brickOptions);
  expect(options.initialization.payer).toMatchObject({ customerId: 'owned-customer', cardsIds: ['owned-card'] });
  expect(options.customization.visual.defaultPaymentOption.savedCardForm).toBe('owned-card');
  await page.getByRole('button', { name: 'Confirmar cartão salvo' }).click();
  await expect(page.getByText('Pagamento aprovado! Seu pedido foi confirmado.')).toBeVisible();
  expect(sent.useSavedCard).toBe(true); expect(sent.token).toBe('fresh-cvv-token'); expect(sent.payer.id).toBeUndefined();
  sent = undefined; await page.reload();
  await page.getByRole('button', { name: 'Deixar de usar cartão padrão' }).click();
  await expect(page.getByText('Cartão padrão: visa · final 1234')).toHaveCount(0);
  expect(removed).toBe(true);
});

test('unprogrammed checkout opens payment, Pix resumes after reload and approval is confirmed', async ({ page }) => {
  let state: any = { orderId: id, total: 89.9, orderStatus: 'PENDING', eligible: true, canPay: true, payment: null, checkoutProfile: profile };
  let savedProfile: any = null; let orderRequests = 0;
  let sent: unknown;
  await page.addInitScript(() => sessionStorage.setItem('iot-token', 'customer'));
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/users/me') return route.fulfill({ json: { name: 'Cliente', role: 'CUSTOMER', email: payer.email } });
    if (path === '/api/products') return route.fulfill({ json: [product] });
    if (path === '/api/users/me/checkout-profile') {
      if (route.request().method() === 'PUT') savedProfile = route.request().postDataJSON();
      return route.fulfill({ json: { profile: savedProfile } });
    }
    if (path === '/api/orders') { orderRequests++; return route.fulfill({ json: order }); }
    if (path === '/api/payments/saved-card') return route.fulfill({ json: { customerId: null, card: null } });
    if (path === '/api/payments/config') return route.fulfill({ json: { enabled: true, publicKey: 'TEST-public' } });
    if (path === `/api/payments/${id}`) {
      if (route.request().method() === 'POST') { sent = route.request().postDataJSON(); state = { ...state, canPay: false, payment: { status: 'pending', method: 'pix', qrCode: 'pix-copia-e-cola', qrBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=' } }; }
      return route.fulfill({ json: state });
    }
    return route.fulfill({ status: 404, json: {} });
  });
  await page.goto('/catalogo');
  await page.getByRole('button', { name: `Adicionar ${product.name}` }).click();
  await page.getByRole('link', { name: 'Carrinho, 1 itens' }).click();
  await page.getByRole('button', { name: 'Registrar pedido' }).click();
  await expect(page.getByRole('alert')).toContainText('dados de entrega');
  expect(orderRequests).toBe(0);
  await page.getByLabel('Nome completo').fill(profile.fullName);
  await page.getByLabel('CPF', { exact: true }).fill('529.982.247-25');
  await page.getByLabel('CEP').fill('01001-000');
  await page.getByLabel('Rua / Avenida').fill(profile.address.street);
  await page.getByLabel('Número', { exact: true }).fill(profile.address.number);
  await page.getByLabel('Bairro').fill(profile.address.neighborhood);
  await page.getByLabel('Cidade').fill(profile.address.city);
  await page.getByLabel('Estado').selectOption('SP');
  await page.getByRole('button', { name: 'Salvar dados e continuar' }).click();
  await expect(page.getByRole('button', { name: 'Alterar dados de entrega' })).toBeVisible();
  expect(savedProfile).toEqual(profile);
  await page.getByRole('button', { name: 'Registrar pedido' }).click();
  await expect(page).toHaveURL(new RegExp(`/pagamento/${id}$`));
  await page.getByLabel('E-mail do pagador').fill(payer.email);
  await page.getByLabel('CPF do pagador').fill(payer.identification.number);
  await page.getByRole('button', { name: 'Gerar QR Code Pix' }).click();
  await expect(page.getByRole('img', { name: 'QR Code Pix para pagar o pedido' })).toBeVisible();
  expect(sent).toEqual({ method: 'pix', payer });
  await page.reload();
  await expect(page.getByLabel('Pix copia e cola')).toHaveValue('pix-copia-e-cola');
  await expect(page.getByRole('button', { name: 'Gerar QR Code Pix' })).toHaveCount(0);
  state = { ...state, orderStatus: 'PAID', eligible: false, payment: { status: 'approved', method: 'pix' } };
  await page.getByRole('button', { name: 'Verificar pagamento', exact: true }).click();
  await expect(page.getByText('Pagamento aprovado! Seu pedido foi confirmado.')).toBeVisible();
});

test('card uses provider token and checkout handles missing credentials', async ({ page }) => {
  let enabled = false; let sent: any;
  let state = { orderId: id, total: 89.9, orderStatus: 'PENDING', eligible: true, canPay: true, payment: null as any, checkoutProfile: profile };
  await page.addInitScript(() => sessionStorage.setItem('iot-token', 'customer'));
  await page.route('https://sdk.mercadopago.com/js/v2', route => route.fulfill({ contentType: 'application/javascript', body: `
    window.MercadoPago = class {
      bricks() { return { create: async (type, id, options) => {
        const host = document.getElementById(id); const button = document.createElement('button'); button.textContent = 'Pagar cartão teste';
        button.onclick = () => options.callbacks.onSubmit({ formData: { token: 'card-token', payment_method_id: 'visa', issuer_id: 1, installments: 1, payer: ${JSON.stringify(payer)} } });
        host.appendChild(button); options.callbacks.onReady(); return { unmount: async () => { host.innerHTML = ''; } };
      } }; }
    };` }));
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/users/me') return route.fulfill({ json: { name: 'Cliente', role: 'CUSTOMER', email: payer.email } });
    if (path === '/api/payments/saved-card') return route.fulfill({ json: { customerId: null, card: null } });
    if (path === '/api/payments/config') return route.fulfill({ json: { enabled, publicKey: enabled ? 'TEST-key' : '' } });
    if (path === `/api/payments/${id}`) {
      if (route.request().method() === 'POST') { sent = route.request().postDataJSON(); state = { ...state, orderStatus: 'PAID', eligible: false, canPay: false, payment: { status: 'approved', method: 'card' } }; }
      return route.fulfill({ json: state });
    }
    return route.fulfill({ status: 404, json: {} });
  });
  await page.goto(`/pagamento/${id}`);
  await expect(page.getByText(/pagamento está temporariamente indisponível/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Gerar QR Code Pix' })).toHaveCount(0);
  enabled = true; await page.reload();
  await page.getByRole('button', { name: 'Cartão', exact: true }).click();
  await expect(page.getByRole('checkbox')).not.toBeChecked();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Pagar cartão teste' }).click();
  await expect(page.getByText('Pagamento aprovado! Seu pedido foi confirmado.')).toBeVisible();
  expect(sent).toEqual({ method: 'card', token: 'card-token', paymentMethodId: 'visa', issuerId: '1', installments: 1, payer, saveCard: true, useSavedCard: false });
});

test('rejected Pix explains rejection and does not display obsolete QR data', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('iot-token', 'customer'));
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/payments/' + id) return route.fulfill({ json: { orderId: id, total: 1, orderStatus: 'PENDING', eligible: true, canPay: true, checkoutProfile: profile, payment: { status: 'rejected', statusDetail: 'test_rejection', method: 'pix', qrCode: 'obsolete-code', qrBase64: 'obsolete-image' } } });
    if (path === '/api/payments/config') return route.fulfill({ json: { enabled: true, publicKey: 'TEST-key' } });
    if (path === '/api/payments/saved-card') return route.fulfill({ json: { card: null, customerId: null } });
    return route.fulfill({ json: {} });
  });
  await page.goto('/pagamento/' + id);
  await expect(page.getByRole('alert')).toContainText('rejeitou');
  await expect(page.getByRole('alert')).toContainText('test_rejection');
  await expect(page.getByRole('img', { name: 'QR Code Pix para pagar o pedido' })).toHaveCount(0);
  await expect(page.getByLabel('Pix copia e cola')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Gerar novo QR Code Pix' })).toBeVisible();
});
