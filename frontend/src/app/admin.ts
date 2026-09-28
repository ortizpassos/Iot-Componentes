import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { FormsModule, NgForm } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Observable } from 'rxjs';
import { Api, Cart, Session, Order, errorMessage } from './core';
import { AdminSettings } from './admin-settings';
import { ProductImage } from './product-image';
import { ConfirmDialog } from './confirm-dialog';

type Tab = 'products' | 'orders' | 'users' | 'devices' | 'projects' | 'settings';
interface Person { _id: string; name: string; email: string }
interface Row {
  additionalImageUrls?: string[];
  installmentFeePayer?: 'BUYER' | 'SELLER';
  _id: string; name?: string; email?: string; role?: string; active?: boolean; sku?: string;
  price?: number; stock?: number; type?: string; description?: string; imageUrl?: string; manufacturer?: string; model?: string;
  specifications?: Record<string, unknown>; programming?: { supported?: boolean; platform?: string; chip?: string };
  status?: string; total?: number; createdAt?: string; customer?: Person; owner?: Person;
  board?: string; serialNumber?: string; macAddress?: string; hardware?: Record<string, unknown>;
  device?: string; source?: string; configuration?: Record<string, unknown>;
}
interface Page { items: Row[]; total: number; page: number; limit: number }
interface Summary { products: number; activeProducts: number; orders: number; pendingOrders: number; customers: number; devices: number; projects: number }
function emptyForm() {
  return { additionalImageUrls: [] as string[], installmentFeePayer: 'BUYER', name: '', sku: '', type: 'BOARD', price: 0, stock: 0, active: true, description: '', imageUrl: '', manufacturer: '', model: '',
    supported: false, platform: '', chip: '', specifications: '{}', ownerId: '', board: 'ESP32', serialNumber: '', macAddress: '', hardware: '{}',
    deviceId: '', source: 'MANUAL', status: 'DRAFT', configuration: '{}' };
}

@Component({ imports: [FormsModule, CurrencyPipe, DatePipe, RouterLink, AdminSettings, ProductImage, ConfirmDialog], templateUrl: './admin.html', styleUrl: './admin.css' })
export class AdminPage {
  private api = inject(Api); private router = inject(Router);
  private destroyRef = inject(DestroyRef);
  uploading = signal(false); imageMessage = signal('');
  session = inject(Session); private cart = inject(Cart);
  logout() { this.session.clear(); this.cart.clear(); void this.router.navigate(['/login']); }
  tab = signal<Tab>('products'); rows = signal<Row[]>([]); summary = signal<Summary | null>(null);
  loading = signal(false); busy = signal(false); error = signal(''); notice = signal(''); summaryError = signal(false);
  editor = signal(false); editingId = ''; form = emptyForm(); search = ''; page = signal(1); total = signal(0);
  detail = signal<(Order & { customer?: Person }) | null>(null);
  pending = signal<{ label: string; path: string; body: object; remove?: boolean; shipId?: string } | null>(null);
  ownerSearch = ''; owners = signal<Row[]>([]); ownerLoading = signal(false);
  tabs: { key: Tab; label: string }[] = [{ key: 'products', label: 'Produtos' }, { key: 'orders', label: 'Pedidos' }, { key: 'users', label: 'Clientes' }, { key: 'devices', label: 'Dispositivos' }, { key: 'projects', label: 'Projetos' }, { key: 'settings', label: 'Configurações do site' }];
  productTypes = [
    { value: 'BOARD', label: 'Placa' }, { value: 'SENSOR', label: 'Sensor' },
    { value: 'MODULE', label: 'Módulo' }, { value: 'KIT', label: 'Kit' },
    { value: 'ACCESSORY', label: 'Acessório' }, { value: 'SERVICE', label: 'Serviço' },
  ];
  private requestId = 0;
  constructor() { this.load(); this.loadSummary(); }
  fail(error: unknown) {
    if ((error as { status?: number })?.status === 403) { void this.router.navigate(['/acesso-restrito']); return; }
    this.error.set(errorMessage(error));
  }
  loadSummary() { this.summaryError.set(false); this.api.get<Summary>('admin/summary').subscribe({ next: data => this.summary.set(data), error: () => this.summaryError.set(true) }); }
  select(tab: Tab) { if (this.busy()) return; this.tab.set(tab); this.page.set(1); this.search = ''; this.editor.set(false); this.detail.set(null); this.pending.set(null); this.notice.set(''); this.load(); }
  load() {
    const request = ++this.requestId; this.loading.set(true); this.error.set('');
    if (this.tab() === 'settings') { this.loading.set(false); return; }
    this.api.get<Page>(`admin/${this.tab()}?page=${this.page()}&limit=20&search=${encodeURIComponent(this.search)}`).subscribe({
      next: data => { if (request !== this.requestId) return; this.rows.set(data.items); this.total.set(data.total); this.loading.set(false); },
      error: error => { if (request !== this.requestId) return; this.loading.set(false); this.fail(error); },
    });
  }
  pages() { return Math.max(1, Math.ceil(this.total() / 20)); }
  searchList() { this.page.set(1); this.load(); }
  move(delta: number) { this.page.update(value => value + delta); this.load(); }
  label(value?: string) { return ({ PENDING: 'Pendente', PAID: 'Pago', SHIPPED: 'Enviado', FULFILLED: 'Concluído', CANCELLED: 'Cancelado', DRAFT: 'Rascunho', READY: 'Pronto', ARCHIVED: 'Arquivado', CUSTOMER: 'Cliente', ADMIN: 'Administrador', SUPPORT: 'Suporte' } as Record<string, string>)[value || ''] || value || ''; }
  transitions(status?: string) { return status === 'PENDING' ? ['PAID', 'CANCELLED'] : status === 'PAID' ? ['SHIPPED', 'CANCELLED'] : []; }
  start(row?: Row) {
    this.imageMessage.set('');
    this.form = emptyForm(); this.editingId = row?._id || ''; this.error.set(''); this.notice.set(''); this.pending.set(null); this.owners.set([]); this.ownerSearch = '';
    if (row) {
      this.form = { ...this.form, name: row.name || '', sku: row.sku || '', type: row.type || 'BOARD', price: row.price || 0, stock: row.stock || 0,
        additionalImageUrls: [...(row.additionalImageUrls || [])], installmentFeePayer: row.installmentFeePayer || 'BUYER', active: row.active !== false, description: row.description || '', imageUrl: row.imageUrl || '', manufacturer: row.manufacturer || '', model: row.model || '',
        supported: !!row.programming?.supported, platform: row.programming?.platform || '', chip: row.programming?.chip || '', specifications: JSON.stringify(row.specifications || {}, null, 2),
        ownerId: row.owner?._id || '', board: row.board || '', serialNumber: row.serialNumber || '', macAddress: row.macAddress || '', hardware: JSON.stringify(row.hardware || {}, null, 2),
        deviceId: row.device || '', source: row.source || 'MANUAL', status: row.status || 'DRAFT', configuration: JSON.stringify(row.configuration || {}, null, 2) };
    }
    this.editor.set(true);
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
        if (!f.sku.trim() || !Number.isInteger(f.stock)) throw new Error('Informe o SKU e um estoque inteiro.');
        body = { name: f.name.trim(), sku: f.sku.trim(), type: f.type, price: f.price, stock: f.stock, active: f.active, description: f.description, imageUrl: f.imageUrl.trim(), manufacturer: f.manufacturer, model: f.model,
          additionalImageUrls: f.additionalImageUrls.map(url => url.trim()), installmentFeePayer: f.installmentFeePayer, specifications: this.object(f.specifications, 'Especificações'), programming: { supported: f.supported, platform: f.platform, chip: f.chip } };
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
    this.busy.set(true); this.error.set(''); this.notice.set('');
    request.subscribe({ next: () => { this.busy.set(false); this.editor.set(false); this.pending.set(null); this.detail.set(null); this.notice.set('Alteração salva.'); this.load(); this.loadSummary(); }, error: e => { this.busy.set(false); this.fail(e); } });
  }
  toggle(row: Row) { this.pending.set({ label: `${row.active ? 'Desativar' : 'Ativar'} ${row.name}?`, path: `admin/${this.tab()}/${row._id}/active`, body: { active: !row.active } }); }
  changeStatus(row: Row, status: string) {
    if (status === 'SHIPPED') { this.pending.set({ label: `Gerar a etiqueta em PDF e marcar o pedido #${row._id.slice(-8)} como enviado?`, path: `admin/orders/${row._id}/ship`, body: {}, shipId: row._id }); return; }
    this.pending.set({ label: `Alterar pedido #${row._id.slice(-8)} para ${this.label(status)}? Esta ação não realiza cobrança, estorno ou movimentação de estoque.`, path: `admin/orders/${row._id}/status`, body: { status } });
  }
  removeProduct(row: Row) { this.pending.set({ label: `Excluir definitivamente ${row.name} do catálogo? O produto deixará de estar disponível. Os dados dos pedidos antigos serão preservados.`, path: `admin/products/${row._id}`, body: {}, remove: true }); }
  confirm() { const action = this.pending(); if (action && !this.busy()) { if (action.shipId) { this.downloadLabel(action.shipId, true); return; } this.mutate(action.remove ? this.api.delete(action.path) : this.api.patch(action.path, action.body)); } }
  downloadLabel(id: string, ship = false) {
    if (this.busy()) return;
    this.busy.set(true); this.error.set(''); this.notice.set('');
    this.api.download(`admin/orders/${id}/${ship ? 'ship' : 'shipping-label'}`, ship).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: pdf => {
        const url = URL.createObjectURL(pdf); const link = document.createElement('a'); link.href = url; link.download = `etiqueta-${id}.pdf`;
        document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
        this.busy.set(false); this.pending.set(null); this.detail.set(null); this.load(); this.loadSummary();
        this.notice.set(ship ? 'Pedido marcado como enviado. Etiqueta em PDF gerada.' : 'Etiqueta em PDF gerada novamente.');
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
