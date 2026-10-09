import { AdminProjectStore } from './admin-project-store';
import { CartPersistence } from './cart-persistence';
import { AdminAbandonedCarts } from './admin-abandoned-carts';
import { AdminUnpaidOrders } from './admin-unpaid-orders';
import { AdminPackages } from './admin-packages';
import { Sidebar } from './sidebar';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { FormsModule, NgForm } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Observable, interval } from 'rxjs';
import { Api, Cart, Session, Order, errorMessage } from './core';
import { StoreValues, defaultStore } from './store-config';
import { AdminSettings } from './admin-settings';
import { ProductImage } from './product-image';
import { ConfirmDialog } from './confirm-dialog';

type Tab = 'abandoned-carts' | 'unpaid-orders' | 'packages' | 'products' | 'orders' | 'users' | 'administrators' | 'devices' | 'projects' | 'settings';
interface Person { _id: string; name: string; email: string }
interface Row {
  requiresShipping?: boolean;
  packagingId?: string;
  printState?: string; printError?: string;
  datasheetUrl?: string; references?: { label: string; url: string }[];
  additionalImageUrls?: string[];
  installmentFeePayer?: 'BUYER' | 'SELLER';
  _id: string; name?: string; email?: string; role?: string; active?: boolean; sku?: string;
  price?: number; stock?: number; type?: string; description?: string; imageUrl?: string; manufacturer?: string; model?: string; weightGrams?: number; lengthCm?: number; widthCm?: number; heightCm?: number;
  specifications?: Record<string, unknown>; programming?: { supported?: boolean; platform?: string; chip?: string }; offer?: { enabled?: boolean; title?: string; description?: string; discountPercent?: number; freeShipping?: boolean; gift?: string; expiresAt?: string };
  status?: string; total?: number; createdAt?: string; customer?: Person; owner?: Person;
  board?: string; serialNumber?: string; macAddress?: string; hardware?: Record<string, unknown>;
  device?: string; source?: string; configuration?: Record<string, unknown>;
}
interface Page { items: Row[]; total: number; page: number; limit: number }
interface Summary { products: number; activeProducts: number; orders: number; pendingOrders: number; customers: number; admins: number; devices: number; projects: number }
function emptyForm() {
  return { datasheetUrl: '', references: [] as { label: string; url: string }[], additionalImageUrls: [] as string[], installmentFeePayer: 'BUYER', name: '', sku: '', type: 'BOARD', price: 0, stock: 0, active: true, description: '', imageUrl: '', manufacturer: '', model: '', packagingId: '', weightGrams: 0, lengthCm: 0, widthCm: 0, heightCm: 0,
    supported: false, platform: '', chip: '', specifications: '{}', ownerId: '', board: 'ESP32', serialNumber: '', macAddress: '', hardware: '{}',
    deviceId: '', source: 'MANUAL', status: 'DRAFT', configuration: '{}', offer: { enabled: false, title: '', description: '', discountPercent: 0, freeShipping: false, gift: '', expiresAt: '' } };
}

@Component({ imports: [AdminProjectStore, AdminAbandonedCarts, AdminUnpaidOrders, AdminPackages, Sidebar, FormsModule, CurrencyPipe, DatePipe, RouterLink, AdminSettings, ProductImage, ConfirmDialog], templateUrl: './admin.html', styleUrl: './admin.css' })
export class AdminPage {
  private api = inject(Api); private router = inject(Router);
  private destroyRef = inject(DestroyRef);
  uploading = signal(false); imageMessage = signal('');
  session = inject(Session); private cart = inject(Cart);
  private cartPersistence = inject(CartPersistence);
  async logout() { if (await this.cartPersistence.logout()) void this.router.navigate(['/login']); else this.error.set(this.cartPersistence.logoutError()); }
  tab = signal<Tab>('products'); rows = signal<Row[]>([]); summary = signal<Summary | null>(null);
  loading = signal(false); busy = signal(false); error = signal(''); notice = signal(''); summaryError = signal(false);
  editor = signal(false); editingId = ''; form = emptyForm(); search = ''; page = signal(1); total = signal(0);
  offerEditor = signal<'global' | 'product' | null>(null); offerProduct = signal<any>(null); offerSettings: StoreValues = structuredClone(defaultStore); offerForm = { enabled: false, discountEnabled: false, title: '', description: '', discountPercent: 0, freeShipping: false, freeShippingMinimum: 0, gift: '', expiresAt: '' };
  detail = signal<(Order & { customer?: Person }) | null>(null);
  pending = signal<{ label: string; path: string; body: object; remove?: boolean; post?: boolean; successMessage?: string } | null>(null);
  ownerSearch = ''; owners = signal<Row[]>([]); ownerLoading = signal(false);
  tabs: { key: Tab; label: string }[] = [{ key: 'products', label: 'Produtos' }, { key: 'packages', label: 'Embalagens' }, { key: 'orders', label: 'Pedidos' }, { key: 'unpaid-orders', label: 'Compras não finalizadas' }, { key: 'abandoned-carts', label: 'Carrinhos abandonados' }, { key: 'users', label: 'Clientes' }, { key: 'administrators', label: 'Administradores' }, { key: 'devices', label: 'Dispositivos' }, { key: 'projects', label: 'Projetos' }, { key: 'settings', label: 'Configurações do site' }];
  productTypes = [
    { value: 'BOARD', label: 'Display' }, { value: 'SENSOR', label: 'Sensor' },
    { value: 'MODULE', label: 'Módulo' }, { value: 'KIT', label: 'Kit' },
    { value: 'ACCESSORY', label: 'Acessório' }, { value: 'SERVICE', label: 'Serviço' },
    { value: 'MICROCONTROLLER_PIC', label: 'Microcontrolador PIC' }, { value: 'ESP32', label: 'ESP32' },
    { value: 'SEMICONDUCTOR', label: 'Semicondutor' }, { value: 'SMART_HOME', label: 'Casa Inteligente' },
  ];
  shipping = signal<Row | null>(null);
  trackingCode = '';
  confirmShipment(form: NgForm) {
    const order = this.shipping();
    if (!order || form.invalid || this.busy()) return;
    this.pending.set({ label: 'Confirmar envio do pedido com rastreio ' + this.trackingCode.trim() + '?', path: 'admin/orders/' + order._id + '/ship', body: { trackingCode: this.trackingCode.trim() }, post: true });
  }
  newAdmin = signal(false);
  editingAdminId = '';
  adminAccount = { name: '', email: '', password: '' };
  createAdmin(form: NgForm) {
    if (form.invalid || this.busy()) return;
    this.busy.set(true); this.error.set('');
    const editing = !!this.editingAdminId;
    const body = { ...this.adminAccount, name: this.adminAccount.name.trim(), email: this.adminAccount.email.trim(), ...(this.editingAdminId && !this.adminAccount.password ? { password: undefined } : {}) };
    const request = this.editingAdminId ? this.api.put(`admin/administrators/${this.editingAdminId}`, body) : this.api.post('admin/administrators', body);
    request.subscribe({
      next: () => { this.busy.set(false); this.shipping.set(null); this.newAdmin.set(false); this.editingAdminId = ''; this.adminAccount = { name: '', email: '', password: '' }; this.notice.set(editing ? 'Administrador atualizado.' : 'Administrador cadastrado.'); this.load(); this.loadSummary(); },
      error: e => { this.busy.set(false); this.fail(e); },
    });
  }
  editAdmin(row: Row) { this.editingAdminId = row._id; this.adminAccount = { name: row.name || '', email: row.email || '', password: '' }; this.error.set(''); this.notice.set(''); this.newAdmin.set(true); }
  removeAdmin(row: Row) { this.pending.set({ label: `Excluir o administrador ${row.name || row.email}?`, path: `admin/administrators/${row._id}`, body: {}, remove: true }); }
  private requestId = 0;
  constructor() {
    this.load(); this.loadSummary();
    interval(15000).pipe(takeUntilDestroyed()).subscribe(() => {
      if (this.tab() === 'orders' && !this.loading() && !this.busy() && !this.pending() && !this.shipping() && !this.detail()) this.load();
    });
  }
  fail(error: unknown) {
    if ((error as { status?: number })?.status === 403) { void this.router.navigate(['/acesso-restrito']); return; }
    this.error.set(errorMessage(error));
  }
  loadSummary() { this.summaryError.set(false); this.api.get<Summary>('admin/summary').subscribe({ next: data => this.summary.set(data), error: () => this.summaryError.set(true) }); }
  select(tab: Tab) { if (this.busy()) return; this.newAdmin.set(false); this.editingAdminId = ''; this.adminAccount = { name: '', email: '', password: '' }; this.tab.set(tab); this.page.set(1); this.search = ''; this.editor.set(false); this.detail.set(null); this.pending.set(null); this.notice.set(''); this.load(); }
  load() {
    const request = ++this.requestId; this.loading.set(true); this.error.set('');
    if (this.tab() === 'projects' || this.tab() === 'abandoned-carts' || this.tab() === 'unpaid-orders' || this.tab() === 'settings' || this.tab() === 'packages') { this.loading.set(false); return; }
    this.api.get<Page>(`admin/${this.tab()}?page=${this.page()}&limit=20&search=${encodeURIComponent(this.search)}`).subscribe({
      next: data => { if (request !== this.requestId) return; this.rows.set(data.items); this.total.set(data.total); this.loading.set(false); },
      error: error => { if (request !== this.requestId) return; this.loading.set(false); this.fail(error); },
    });
  }
  pages() { return Math.max(1, Math.ceil(this.total() / 20)); }
  searchList() { this.page.set(1); this.load(); }
  move(delta: number) { this.page.update(value => value + delta); this.load(); }
  label(value?: string) { return ({ CLAIMED: 'Reservada', PRINTING: 'Em impressão', ERROR: 'Falha', DONE: 'Aceita pela impressora', PENDING: 'Pendente', PAID: 'Pago', LABEL_ISSUED: 'Etiqueta emitida', SHIPPED: 'Enviado', FULFILLED: 'Concluído', CANCELLED: 'Cancelado', DRAFT: 'Rascunho', READY: 'Pronto', ARCHIVED: 'Arquivado', CUSTOMER: 'Cliente', ADMIN: 'Administrador', SUPPORT: 'Suporte' } as Record<string, string>)[value || ''] || value || ''; }
  transitions(status?: string) { return status === 'PENDING' ? ['PAID', 'CANCELLED'] : status === 'PAID' ? ['LABEL_ISSUED', 'CANCELLED'] : status === 'LABEL_ISSUED' ? ['SHIPPED'] : []; }
  start(row?: Row) {

    this.imageMessage.set('');
    this.form = emptyForm(); this.editingId = row?._id || ''; this.error.set(''); this.notice.set(''); this.pending.set(null); this.owners.set([]); this.ownerSearch = '';
    if (row) {
      this.form = { ...this.form, name: row.name || '', sku: row.sku || '', type: row.type || 'BOARD', price: row.price || 0, stock: row.stock || 0,
        datasheetUrl: row.datasheetUrl || '', references: (row.references || []).map(ref => ({ ...ref })), additionalImageUrls: [...(row.additionalImageUrls || [])], installmentFeePayer: row.installmentFeePayer || 'BUYER', active: row.active !== false, description: row.description || '', imageUrl: row.imageUrl || '', manufacturer: row.manufacturer || '', model: row.model || '',
        supported: !!row.programming?.supported, platform: row.programming?.platform || '', chip: row.programming?.chip || '', specifications: JSON.stringify(row.specifications || {}, null, 2), packagingId: row.packagingId || '', weightGrams: row.weightGrams || 0, lengthCm: row.lengthCm || 0, widthCm: row.widthCm || 0, heightCm: row.heightCm || 0, offer: { ...this.form.offer, enabled: !!row.offer?.enabled, title: row.offer?.title || '', description: row.offer?.description || '', discountPercent: row.offer?.discountPercent || 0, freeShipping: !!row.offer?.freeShipping, gift: row.offer?.gift || '', expiresAt: row.offer?.expiresAt ? String(row.offer.expiresAt).slice(0, 10) : '' },
        ownerId: row.owner?._id || '', board: row.board || '', serialNumber: row.serialNumber || '', macAddress: row.macAddress || '', hardware: JSON.stringify(row.hardware || {}, null, 2),
        deviceId: row.device || '', source: row.source || 'MANUAL', status: row.status || 'DRAFT', configuration: JSON.stringify(row.configuration || {}, null, 2) };
    }
    this.editor.set(true);
  }
  openGlobalOffer() {
    if (this.busy()) return;
    this.error.set(''); this.api.get<StoreValues>('settings').subscribe({ next: value => { this.offerSettings = structuredClone({ ...defaultStore, ...value }); this.offerForm = { ...this.offerForm, ...this.offerSettings.globalOffer, discountEnabled: this.offerSettings.globalOffer.discountEnabled ?? this.offerSettings.globalOffer.discountPercent > 0 }; this.offerEditor.set('global'); }, error: e => this.fail(e) });
  }
  openProductOffer(row: Row) {
    if (this.busy()) return;
    this.error.set(''); this.api.get<any>('products/' + row._id).subscribe({ next: product => { this.offerProduct.set(product); this.offerForm = { enabled: !!product.offer?.enabled, discountEnabled: (product.offer?.discountPercent || 0) > 0, title: product.offer?.title || '', description: product.offer?.description || '', discountPercent: product.offer?.discountPercent || 0, freeShipping: !!product.offer?.freeShipping, freeShippingMinimum: 0, gift: product.offer?.gift || '', expiresAt: product.offer?.expiresAt ? String(product.offer.expiresAt).slice(0, 10) : '' }; this.offerEditor.set('product'); }, error: e => this.fail(e) });
  }
  saveOffer() {
    if (this.busy() || !this.offerEditor()) return;
    if (this.offerForm.enabled && !this.offerForm.title.trim()) { this.error.set('Informe o título da oferta.'); return; }
    const offer = { ...this.offerForm, title: this.offerForm.title.trim(), description: this.offerForm.description.trim(), gift: this.offerForm.gift.trim(), expiresAt: this.offerForm.expiresAt || undefined };
    const request = this.offerEditor() === 'global'
      ? this.api.put('settings', { ...this.offerSettings, globalOffer: offer })
      : (() => { const product = this.offerProduct(); const { _id, createdAt, updatedAt, __v, ...fields } = product; return this.api.put('admin/products/' + _id, { ...fields, offer }); })();
    const kind = this.offerEditor();
    this.busy.set(true); this.error.set('');
    request.subscribe({ next: () => { this.busy.set(false); this.offerEditor.set(null); this.notice.set(kind === 'global' ? 'Oferta global salva.' : 'Oferta do produto salva.'); this.load(); }, error: e => { this.busy.set(false); this.fail(e); } });
  }
  validImageUrl(value: string) {
    if (!value) return true;
    if (value.length > 2048) return false;
    if (/^\/api\/product-images\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.(jpg|png|webp)$/.test(value)) return true;
    if (!/^https?:\/\//i.test(value) || /\s/.test(value)) return false;
    try { const url = new URL(value); return !!url.hostname && !url.username && !url.password; } catch { return false; }
  }
  uploadImage(event: Event, index = -1) {
    const input = event.target as HTMLInputElement; const file = input.files?.[0]; input.value = '';
    if (!file || this.busy()) return;
    this.error.set(''); this.imageMessage.set('');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { this.error.set('Selecione uma imagem JPG, PNG ou WebP.'); return; }
    if (!file.size || file.size > 5 * 1024 * 1024) { this.error.set('A imagem deve ter entre 1 byte e 5 MB.'); return; }
    const body = new FormData(); body.append('image', file);
    this.busy.set(true); this.uploading.set(true);
    this.api.post<{ imageUrl: string }>('admin/product-images', body).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: result => { if (index < 0) this.form.imageUrl = result.imageUrl; else this.form.additionalImageUrls[index] = result.imageUrl; this.imageMessage.set('Imagem enviada. Salve o componente para aplicar.'); this.busy.set(false); this.uploading.set(false); },
      error: error => { this.busy.set(false); this.uploading.set(false); this.fail(error); },
    });
  }
  findOwners() {
    this.ownerLoading.set(true);
    this.api.get<Page>(`admin/users?limit=20&search=${encodeURIComponent(this.ownerSearch)}`).subscribe({ next: data => { this.owners.set(data.items.filter(u => u.active)); this.ownerLoading.set(false); }, error: e => { this.ownerLoading.set(false); this.fail(e); } });
  }
  uploadDatasheet(event: Event) {
    const input = event.target as HTMLInputElement; const file = input.files?.[0]; input.value = '';
    if (!file || this.busy()) return;
    if (file.type !== 'application/pdf' || !file.size || file.size > 10 * 1024 * 1024) { this.error.set('Selecione um PDF de até 10 MB.'); return; }
    const body = new FormData(); body.append('file', file);
    this.busy.set(true); this.error.set('');
    this.api.post<{ datasheetUrl: string }>('admin/product-datasheets', body).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: result => { this.form.datasheetUrl = result.datasheetUrl; this.busy.set(false); this.imageMessage.set('Datasheet enviado. Salve o componente para aplicar.'); },
      error: e => { this.busy.set(false); this.fail(e); },
    });
  }
  object(text: string, field: string) {
    let value: unknown; try { value = JSON.parse(text); } catch { throw new Error(`${field}: informe um JSON válido.`); }
    if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error(`${field}: informe um objeto JSON.`);
    return value;
  }
  save(ngForm: NgForm) {
    if (this.busy() || ngForm.invalid) return;
    const f = this.form; let body: object;
    try {
      if (!f.name.trim()) throw new Error('Informe o nome.');
      if (this.tab() === 'products') {
        if (f.additionalImageUrls.length > 4 || f.additionalImageUrls.some(url => !url.trim() || !this.validImageUrl(url.trim()))) throw new Error('Preencha os links das imagens adicionais ou remova os campos vazios.');
        if (!this.validImageUrl(f.imageUrl.trim())) throw new Error('Informe um link HTTP/HTTPS válido para a imagem.');
        if (f.type !== 'SERVICE' && (!Number.isInteger(f.weightGrams) || f.weightGrams < 1)) throw new Error('Informe o peso do item em gramas inteiras.');
        if (!Number.isInteger(f.stock)) throw new Error('Informe um estoque inteiro.');
        body = { name: f.name.trim(), ...(f.sku.trim() ? { sku: f.sku.trim() } : {}), type: f.type, price: f.price, stock: f.stock, active: f.active, description: f.description, imageUrl: f.imageUrl.trim(), manufacturer: f.manufacturer, model: f.model, ...(f.type !== 'SERVICE' ? { weightGrams: f.weightGrams } : {}),
          datasheetUrl: f.datasheetUrl, references: f.references.map(ref => ({ label: ref.label.trim(), url: ref.url.trim() })), additionalImageUrls: f.additionalImageUrls.map(url => url.trim()), installmentFeePayer: f.installmentFeePayer, specifications: this.object(f.specifications, 'Especificações'), programming: { supported: f.supported, platform: f.platform, chip: f.chip }, offer: { ...f.offer, title: f.offer.title.trim(), description: f.offer.description.trim(), gift: f.offer.gift.trim(), expiresAt: f.offer.expiresAt || undefined } };
      } else if (this.tab() === 'devices') {
        body = { name: f.name.trim(), ownerId: f.ownerId, board: f.board.trim(), model: f.model, ...(f.serialNumber.trim() ? { serialNumber: f.serialNumber.trim() } : {}), macAddress: f.macAddress, hardware: this.object(f.hardware, 'Hardware') };
      } else {
        body = { name: f.name.trim(), ownerId: f.ownerId, description: f.description, source: f.source, status: f.status, ...(f.deviceId.trim() ? { deviceId: f.deviceId.trim() } : {}), configuration: this.object(f.configuration, 'Configuração') };
      }
    } catch (error) { this.error.set((error as Error).message); return; }
    const path = `admin/${this.tab()}`;
    this.mutate(this.editingId ? this.api.put(`${path}/${this.editingId}`, body) : this.api.post(path, body));
  }
  mutate(request: Observable<unknown>) {
    const successMessage = this.pending()?.successMessage || 'Alteração salva.';
    this.busy.set(true); this.error.set(''); this.notice.set('');
    request.subscribe({ next: () => { this.busy.set(false); this.shipping.set(null); this.editor.set(false); this.pending.set(null); this.detail.set(null); this.notice.set(successMessage); this.load(); this.loadSummary(); }, error: e => { this.busy.set(false); this.fail(e); } });
  }
  toggle(row: Row) { this.pending.set({ label: `${row.active ? 'Desativar' : 'Ativar'} ${row.name}?`, path: `admin/${this.tab()}/${row._id}/active`, body: { active: !row.active } }); }
  changeStatus(row: Row, status: string) {
    if (status === 'PAID') { this.pending.set({ label: 'Confirmar que o pagamento do pedido #' + row._id.slice(-8) + ' foi recebido? Esta confirmacao e manual e nao cobra nem cancela tentativas no Mercado Pago.', path: 'admin/orders/' + row._id + '/status', body: { status } }); return; }
    if (status === 'SHIPPED') { this.shipping.set(row); this.trackingCode = ''; return; }
    if (status === 'LABEL_ISSUED') { this.pending.set({ label: `Enviar a etiqueta do pedido #${row._id.slice(-8)} para a impressora?`, path: `admin/orders/${row._id}/issue-label`, body: {}, post: true, successMessage: 'Etiqueta na fila. O monitor imprimira quando estiver conectado. Atualize a lista para acompanhar.' }); return; }
    this.pending.set({ label: `Alterar pedido #${row._id.slice(-8)} para ${this.label(status)}? Esta ação não realiza cobrança, estorno ou movimentação de estoque.`, path: `admin/orders/${row._id}/status`, body: { status } });
  }
  retryPrint(row: Row) { this.pending.set({ label: 'Confirme que o monitor esta parado e que a etiqueta nao foi impressa. Reenfileirar pode gerar uma copia se a impressora ja recebeu o trabalho.', path: 'admin/orders/' + row._id + '/retry-print', body: {}, post: true }); }
  removeProduct(row: Row) { this.pending.set({ label: `Excluir definitivamente ${row.name} do catálogo? O produto deixará de estar disponível. Os dados dos pedidos antigos serão preservados.`, path: `admin/products/${row._id}`, body: {}, remove: true }); }
  confirm() { const action = this.pending(); if (action && !this.busy()) { this.mutate(action.post ? this.api.post(action.path, action.body) : action.remove ? this.api.delete(action.path) : this.api.patch(action.path, action.body)); } }
  downloadLabel(id: string) {
    if (this.busy()) return;
    this.busy.set(true); this.error.set(''); this.notice.set('');
    this.api.download(`admin/orders/${id}/shipping-label`).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: pdf => {
        const url = URL.createObjectURL(pdf); const link = document.createElement('a'); link.href = url; link.download = `etiqueta-${id}.pdf`;
        document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
        this.busy.set(false); this.pending.set(null); this.detail.set(null); this.load(); this.loadSummary();
        this.notice.set('Etiqueta em PDF gerada novamente.');
      },
      error: async e => {
        this.busy.set(false);
        this.load();
        if (e.error instanceof Blob) {
          try { const body = JSON.parse(await e.error.text()); if (typeof body.message === 'string') { this.error.set(body.message); return; } } catch { /* Use the standard transport error below. */ }
        }
        this.fail(e);
      },
    });
  }
  showOrder(row: Row) { this.error.set(''); this.busy.set(true); this.api.get<Order & { customer?: Person }>(`admin/orders/${row._id}`).subscribe({ next: order => { this.detail.set(order); this.busy.set(false); }, error: e => { this.busy.set(false); this.fail(e); } }); }
}
