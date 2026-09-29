import { Component, DestroyRef, inject, signal } from '@angular/core';
import { CurrencyPipe, JsonPipe, KeyValuePipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Api, Cart, Product, errorMessage } from './core';
import { ProductImage } from './product-image';

@Component({
  imports: [CurrencyPipe, RouterLink, ProductImage, KeyValuePipe, JsonPipe],
  template: `
    <a class="back-link" routerLink="/catalogo">← Voltar ao catálogo</a>
    @if (loading()) { <p role="status">Carregando produto…</p> }
    @else if (error()) { <p class="error" role="alert">{{ error() }}</p><button (click)="load()">Tentar novamente</button> }
    @else if (product(); as item) {
      <div class="product-detail">
        <section class="panel" aria-label="Imagens do produto">
          <div class="main-image"><app-product-image [src]="images()[selected()] || ''" [alt]="item.name + ' — imagem ' + (selected() + 1)" /></div>
          @if (images().length > 1) {
            <div class="thumbnails">@for (url of images(); track $index; let i = $index) {
              <button [class.selected]="selected() === i" [attr.aria-pressed]="selected() === i" [attr.aria-label]="'Ver imagem ' + (i + 1)" (click)="selected.set(i)"><app-product-image [src]="url" alt="" /></button>
            }</div>
          }
        </section>
        <section class="panel">
          <p class="eyebrow">{{ typeLabel(item.type) }}</p><h1>{{ item.name }}</h1>
          <p class="muted">SKU: {{ item.sku }}</p><p class="price">{{ item.price | currency:'BRL' }}</p>
          <p>{{ item.stock }} em estoque</p>
          @if (item.manufacturer) { <p><strong>Fabricante:</strong> {{ item.manufacturer }}</p> }
          @if (item.model) { <p><strong>Modelo:</strong> {{ item.model }}</p> }
          @if (item.programming?.supported) { <p>Suporta programação</p> }
          @if (item.programming?.platform) { <p><strong>Plataforma:</strong> {{ item.programming?.platform }}</p> }
          @if (item.programming?.chip) { <p><strong>Chip:</strong> {{ item.programming?.chip }}</p> }
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
  styles: `.product-detail{display:grid;grid-template-columns:1fr 1fr;gap:24px}.main-image{height:380px}.thumbnails{display:flex;gap:8px;margin-top:16px}.thumbnails button{width:calc((100% - 32px)/5);height:70px;padding:0}.thumbnails .selected{border:2px solid var(--primary)}.price{font-size:30px;font-weight:700}.actions{display:flex;flex-wrap:wrap;gap:12px}.description{margin-top:24px}.description p,dd{white-space:pre-wrap;overflow-wrap:anywhere}dt{font-weight:700}dd{margin:4px 0 16px}h1{overflow-wrap:anywhere}@media(max-width:800px){.product-detail{grid-template-columns:1fr}.main-image{height:280px}}`,
})
export class ProductDetailPage {
  private api = inject(Api); cart = inject(Cart); private router = inject(Router);
  private route = inject(ActivatedRoute); private destroy = inject(DestroyRef);
  product = signal<Product | null>(null); images = signal<string[]>([]); selected = signal(0);
  loading = signal(true); error = signal(''); message = signal(''); private requestId = 0;
  constructor() { this.route.paramMap.pipe(takeUntilDestroyed(this.destroy)).subscribe(() => this.load()); }
  load() {
    const request = ++this.requestId;
    this.loading.set(true); this.error.set(''); this.message.set(''); this.product.set(null); this.selected.set(0);
    this.api.get<Product & { active?: boolean }>(`products/${encodeURIComponent(this.route.snapshot.paramMap.get('id') || '')}`).pipe(takeUntilDestroyed(this.destroy)).subscribe({
      next: item => {
        if (request !== this.requestId) return;
        if (item.active === false) this.error.set('Produto indisponível.');
        else { this.product.set(item); this.images.set([item.imageUrl || '', ...(item.additionalImageUrls || [])].filter(Boolean).slice(0, 5)); }
        this.loading.set(false);
      },
      error: e => { if (request === this.requestId) { this.error.set(e.status === 404 ? 'Produto não encontrado.' : errorMessage(e)); this.loading.set(false); } },
    });
  }
  isObject(value: unknown) { return value !== null && typeof value === 'object'; }
  typeLabel(type: string) { return ({ BOARD: 'Placa', SENSOR: 'Sensor', MODULE: 'Módulo', KIT: 'Kit', ACCESSORY: 'Acessório', SERVICE: 'Serviço' } as Record<string, string>)[type] || type; }
  add(product: Product) { if (!this.cart.add(product)) return; this.message.set('Produto adicionado ao carrinho.'); }
  buy(product: Product) { if (product.stock < 1) return; void this.router.navigate(['/finalizar-compra', product._id]); }
}
