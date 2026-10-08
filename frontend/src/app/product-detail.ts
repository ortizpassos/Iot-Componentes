import { Component, DestroyRef, inject, signal } from '@angular/core';
import { CurrencyPipe, JsonPipe, KeyValuePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Api, Cart, Product, ShippingQuote, errorMessage } from './core';
import { ProductImage } from './product-image';
import { StoreConfig } from './store-config';

@Component({
  imports: [CurrencyPipe, FormsModule, RouterLink, ProductImage, KeyValuePipe, JsonPipe],
  template: `
    <a class="back-link" routerLink="/catalogo">← Voltar ao catálogo</a>
    @if (loading()) { <p role="status">Carregando produto…</p> }
    @else if (error()) { <p class="error" role="alert">{{ error() }}</p><button (click)="load()">Tentar novamente</button> }
    @else if (product(); as item) {
      <div class="product-detail">
        <section class="panel" aria-label="Imagens do produto">
          <div class="main-image"><app-product-image [src]="images()[selected()] || ''" [alt]="item.name + ' — imagem ' + (selected() + 1)" />@if (offerActive(item)) { <span class="offer-splash">Oferta especial!</span> }</div>
          @if (images().length > 1) {
            <div class="thumbnails">@for (url of images(); track $index; let i = $index) {
              <button [class.selected]="selected() === i" [attr.aria-pressed]="selected() === i" [attr.aria-label]="'Ver imagem ' + (i + 1)" (click)="selected.set(i)"><app-product-image [src]="url" alt="" /></button>
            }</div>
          }
        </section>
        <section class="panel">
          <p class="eyebrow">{{ typeLabel(item.type) }}</p><h1>{{ item.name }}</h1>
          <p class="muted">SKU: {{ item.sku }}</p><p class="price">{{ item.price | currency:'BRL' }}</p>
          @if (offerActive(item)) { <section class="offer-panel"><h2>{{ item.offer?.title || 'Oferta especial' }}</h2><p>{{ item.offer?.description }}</p>@if (item.offer?.discountPercent) { <p><strong>{{ item.offer?.discountPercent }}% de desconto</strong></p> }@if (item.offer?.freeShipping) { <p><strong>Frete grátis</strong></p> }@if (item.offer?.gift) { <p>Brinde: <strong>{{ item.offer?.gift }}</strong></p> }</section> }
          @if (item.stock < 1) { <p class="sold-out" role="status">Esgotado!</p> } @else { <p>{{ item.stock }} em estoque</p> }
          @if (item.manufacturer) { <p><strong>Fabricante:</strong> {{ item.manufacturer }}</p> }
          @if (item.model) { <p><strong>Modelo:</strong> {{ item.model }}</p> }
          @if (item.programming?.supported) { <p>Suporta programação</p> }
          @if (item.programming?.platform) { <p><strong>Plataforma:</strong> {{ item.programming!.platform }}</p> }
          @if (item.programming?.chip) { <p><strong>Chip:</strong> {{ item.programming!.chip }}</p> }
          <div class="shipping-panel"><label>CEP de entrega<input name="shippingZipCode" inputmode="numeric" maxlength="9" placeholder="00000-000" [(ngModel)]="shippingZipCode" (ngModelChange)="onShippingZipCodeChange()"></label>@if (shippingBusy()) { <p class="muted" role="status">Calculando frete…</p> } @if (shippingError()) { <p class="error" role="alert">{{ shippingError() }}</p> } @if (shippingQuote(); as quote) { @for (service of quote.services; track service.code) { <div class="shipping-line"><span>{{ service.name }}{{ service.deliveryDays ? ' · até ' + service.deliveryDays + ' dias úteis' : '' }}</span><strong>{{ service.price | currency:'BRL' }}</strong></div> } }</div>
          <div class="actions"><button class="secondary" [disabled]="!cart.canAdd(item)" (click)="add(item)">Adicionar +</button><button class="primary" [disabled]="item.stock < 1" (click)="buy(item)">Comprar agora</button></div>
          @if (message()) { <p class="notice" role="status">{{ message() }}</p> }
        </section>
      </div>
      <section class="panel description"><h2>Descrição completa</h2><p>{{ item.description || 'Descrição não informada.' }}</p></section>
      @if (item.datasheetUrl || item.references?.length) {
        <section class="panel description"><h2>Documentação e referências</h2>
          @if (item.datasheetUrl) { <a class="button secondary" [href]="item.datasheetUrl" target="_blank" rel="noopener noreferrer">Baixar datasheet (PDF)</a> }
          @for (ref of item.references || []; track $index) { <p><a [href]="ref.url" target="_blank" rel="noopener noreferrer">{{ ref.label }} ↗</a></p> }
        </section>
      }
      @if (item.specifications && (item.specifications | keyvalue).length) {
        <section class="panel description"><h2>Especificações</h2><dl>@for (entry of item.specifications | keyvalue; track entry.key) { <dt>{{ entry.key }}</dt><dd>{{ isObject(entry.value) ? (entry.value | json) : entry.value }}</dd> }</dl></section>
      }
    }
  `,
  styles: `.product-detail{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:24px}.main-image{position:relative;height:380px}.offer-splash{position:absolute;top:14px;right:14px;z-index:3;padding:8px 10px;background:#16803c;color:#fff;font-size:12px;font-weight:800;letter-spacing:.2px;box-shadow:0 3px 9px #102a1c4d;transform:rotate(3deg)}.thumbnails{display:flex;gap:8px;margin-top:16px}.thumbnails button{width:calc((100% - 32px)/5);height:70px;padding:0}.thumbnails .selected{border:2px solid var(--primary)}.price{font-size:30px;font-weight:700}.offer-panel{margin:16px 0;padding:16px;border:1px solid #bc8332;background:#fff9ed}.offer-panel h2{margin-top:0;font-size:20px}.sold-out{color:var(--danger,#b42318);font-weight:700}.actions{display:flex;flex-wrap:wrap;gap:12px}.shipping-panel{margin:20px 0;padding-top:16px;border-top:1px solid var(--border)}.shipping-panel label{display:block}.shipping-panel input{display:block;width:100%;margin-top:6px}.shipping-line{display:flex;justify-content:space-between;gap:12px;margin-top:8px}.description{margin-top:24px}.description p,dd{white-space:pre-wrap;overflow-wrap:anywhere}dt{font-weight:700}dd{margin:4px 0 16px}h1{overflow-wrap:anywhere}@media(max-width:800px){.product-detail{grid-template-columns:minmax(0,1fr)}.main-image{height:280px}}`,
})
export class ProductDetailPage {
  private api = inject(Api); cart = inject(Cart); private router = inject(Router); private store = inject(StoreConfig);
  private route = inject(ActivatedRoute); private destroy = inject(DestroyRef);
  product = signal<Product | null>(null); images = signal<string[]>([]); selected = signal(0);
  loading = signal(true); error = signal(''); message = signal(''); shippingZipCode = ''; shippingBusy = signal(false); shippingError = signal(''); shippingQuote = signal<ShippingQuote | null>(null); private lastShippingZipCode = ''; private requestId = 0;
  constructor() { this.route.paramMap.pipe(takeUntilDestroyed(this.destroy)).subscribe(() => this.load()); }
  load() {
    const request = ++this.requestId;
    this.loading.set(true); this.error.set(''); this.message.set(''); this.product.set(null); this.selected.set(0);
    this.api.get<Product & { active?: boolean }>(`products/${encodeURIComponent(this.route.snapshot.paramMap.get('id') || '')}`).pipe(takeUntilDestroyed(this.destroy)).subscribe({
      next: item => {
        if (request !== this.requestId) return;
        if (item.active === false) this.error.set('Produto indisponível.');
        else { this.product.set(item); this.images.set([item.imageUrl || '', ...(item.additionalImageUrls || [])].filter(Boolean).slice(0, 5)); this.loadShippingProfile(); }
        this.loading.set(false);
      },
      error: e => { if (request === this.requestId) { this.error.set(e.status === 404 ? 'Produto não encontrado.' : errorMessage(e)); this.loading.set(false); } },
    });
  }
  private loadShippingProfile() { this.api.get<{ profile: { address: { zipCode: string } } | null }>('users/me/checkout-profile').subscribe({ next: data => { if (data.profile?.address.zipCode) { this.shippingZipCode = data.profile.address.zipCode; this.calculateShipping(); } }, error: () => undefined }); }
  onShippingZipCodeChange() {
    const zipCode = this.shippingZipCode.replace(/\D/g, '');
    this.shippingError.set('');
    if (zipCode.length < 8) { this.shippingQuote.set(null); this.lastShippingZipCode = ''; return; }
    if (zipCode.length === 8 && zipCode !== this.lastShippingZipCode) this.calculateShipping();
  }
  calculateShipping() {
    const zipCode = this.shippingZipCode.replace(/\D/g, '');
    if (!/^\d{8}$/.test(zipCode) || !this.product()) { this.shippingError.set('Informe um CEP válido com 8 números.'); return; }
    this.lastShippingZipCode = zipCode;
    this.shippingBusy.set(true); this.shippingError.set('');
    this.api.post<ShippingQuote>('shipping/quote', { destinationZipCode: zipCode, items: [{ productId: this.product()!._id, quantity: 1 }] }).subscribe({ next: quote => { this.shippingQuote.set(quote); this.shippingBusy.set(false); }, error: e => { this.shippingError.set(errorMessage(e)); this.shippingBusy.set(false); } });
  }
  isObject(value: unknown) { return value !== null && typeof value === 'object'; }
  offerActive(product: Product) { const global = this.store.value().globalOffer; return (!!product.offer?.enabled && (!product.offer.expiresAt || new Date(product.offer.expiresAt).getTime() > Date.now())) || (!!global?.enabled && (!global.expiresAt || new Date(global.expiresAt).getTime() > Date.now())); }
  typeLabel(type: string) { return ({ BOARD: 'Display', SENSOR: 'Sensor', MODULE: 'Módulo', KIT: 'Kit', ACCESSORY: 'Acessório', SERVICE: 'Serviço', MICROCONTROLLER_PIC: 'Microcontrolador PIC', ESP32: 'ESP32', SEMICONDUCTOR: 'Semicondutor', SMART_HOME: 'Casa Inteligente' } as Record<string, string>)[type] || type; }
  add(product: Product) { if (!this.cart.add(product)) return; this.message.set('Produto adicionado ao carrinho.'); }
  buy(product: Product) { if (product.stock < 1) return; void this.router.navigate(['/finalizar-compra', product._id]); }
}
