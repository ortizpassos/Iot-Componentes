import { Component, computed, inject, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { FormsModule, NgForm } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Api, Cart, Order, Product, Session, errorMessage } from './core';
import { StoreConfig } from './store-config';
import { ProductImage } from './product-image';
import { CheckoutProfileForm } from './checkout-profile';
import { StoreBanner } from './store-banner';

@Component({ imports: [CurrencyPipe, FormsModule, RouterLink, ProductImage, StoreBanner], template: `
  <div class="page-heading"><div><p class="eyebrow">EXPLORE. CONECTE. CRIE.</p><h1>{{ store.value().catalogTitle }}</h1><p class="subtitle">{{ store.value().catalogDescription }}</p></div></div>
  <app-store-banner />
  @if (store.value().contactEmail) { <p class="muted">Contato: <a [href]="'mailto:' + store.value().contactEmail">{{ store.value().contactEmail }}</a></p> }
  <div class="toolbar"><h2>Catálogo <small>{{ filtered().length }} produtos</small></h2><label class="search"><span class="sr-only">Buscar produto</span><input placeholder="Buscar nome, SKU ou modelo…" [ngModel]="query()" (ngModelChange)="query.set($event)"></label></div>
  <div class="filters" aria-label="Tipo de produto">@for (type of types; track type.value) { <button [class.selected]="filter() === type.value" (click)="filter.set(type.value)">{{ type.label }}</button> }</div>
  @if (message()) { <p class="notice" role="status">{{ message() }}</p> }
  @if (loading()) { <p class="empty" role="status">Carregando catálogo…</p> }
  @else if (error()) { <div class="error" role="alert">{{ error() }} <button (click)="load()">Tentar novamente</button></div> }
  @else { <div class="product-grid">@for (product of filtered(); track product._id) {
    <article class="product-card"><a class="product-visual" [routerLink]="['/produto', product._id]" [attr.aria-label]="'Ver detalhes de ' + product.name"><span class="product-type">{{ label(product.type) }}</span><app-product-image [src]="product.imageUrl || ''" [alt]="product.name" />@if (product.programming?.supported) { <span class="programmable">⌘ Programável</span> }</a>
      <div class="product-body"><small class="muted">{{ product.manufacturer || product.sku }}</small>
        <h3><a class="product-title" [routerLink]="['/produto', product._id]">{{ product.name }}</a></h3>
        <button class="description-toggle text-button" (click)="toggleDescription(product._id)" [attr.aria-expanded]="expanded().has(product._id)" [attr.aria-controls]="'description-' + product._id">{{ expanded().has(product._id) ? 'Mostrar menos' : 'Mostrar mais' }}<span class="sr-only"> sobre {{ product.name }}</span></button>
        <p class="product-description" [id]="'description-' + product._id" [hidden]="!expanded().has(product._id)">{{ product.description || product.model || 'Componente para seu próximo projeto.' }}</p>
        <div class="product-bottom"><div><strong>{{ product.price | currency:'BRL' }}</strong><small class="muted">{{ product.stock }} em estoque</small></div><button class="secondary" (click)="add(product)" [attr.aria-label]="'Adicionar ' + product.name">Adicionar +</button></div><button class="primary full" (click)="buyNow(product)" [attr.aria-label]="'Comprar agora ' + product.name">Comprar agora</button></div>
    </article>
  } @empty { <p class="empty">Nenhum produto encontrado. Tente outra busca ou aguarde novos componentes.</p> }</div> }
`, styles: `.product-title{padding:0;border:0;border-radius:0;background:transparent;text-align:left;font:inherit;color:inherit;overflow-wrap:anywhere}.description-toggle{padding:4px 0;text-decoration:underline}.product-description{white-space:pre-wrap;overflow-wrap:anywhere}.product-grid{align-items:start}` })
export class CatalogPage {
  expanded = signal<Set<string>>(new Set());
  toggleDescription(id: string) { this.expanded.update(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }
  store = inject(StoreConfig);
  private api = inject(Api); private cart = inject(Cart); private router = inject(Router);
  products = signal<Product[]>([]); loading = signal(true); error = signal(''); message = signal(''); query = signal(''); filter = signal('');
  types = [{ value: '', label: 'Todos' }, { value: 'BOARD', label: 'Placas' }, { value: 'SENSOR', label: 'Sensores' }, { value: 'MODULE', label: 'Módulos' }, { value: 'KIT', label: 'Kits' }, { value: 'ACCESSORY', label: 'Acessórios' }, { value: 'SERVICE', label: 'Serviços' }];
  filtered = computed(() => this.products().filter(p => (!this.filter() || p.type === this.filter()) && `${p.name} ${p.sku} ${p.model || ''}`.toLocaleLowerCase().includes(this.query().toLocaleLowerCase())));
  constructor() { this.load(); }
  label(type: string) { return this.types.find(t => t.value === type)?.label || type; }
  load() { this.loading.set(true); this.error.set(''); this.api.get<Product[]>('products').subscribe({ next: data => { this.products.set(data); this.loading.set(false); }, error: e => { this.error.set(errorMessage(e)); this.loading.set(false); } }); }
  buyNow(product: Product) { void this.router.navigate(['/finalizar-compra', product._id]); }
  add(product: Product) { this.cart.add(product); this.message.set(`${product.name} adicionado ao carrinho.`); }
}

@Component({ imports: [FormsModule, CurrencyPipe, RouterLink, CheckoutProfileForm], template: `
  <p class="eyebrow">SEU PRÓXIMO PROJETO</p><h1>{{ directPurchase ? 'Finalizar compra' : 'Carrinho' }}</h1><p class="subtitle">Revise os componentes e conte o que você quer construir.</p>
  @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
  @if (session.token() && cart.lines().length) { <app-checkout-profile (ready)="profileReady.set(!!$event)" /> }
  @if (loading()) { <p role="status">Carregando produto...</p> }
  @else if (!cart.lines().length) { <div class="panel empty"><h2>{{ directPurchase ? 'Produto indisponível' : 'Seu carrinho está vazio' }}</h2><p>Explore o catálogo para começar.</p><a class="button primary" routerLink="/catalogo">Explorar componentes</a></div> }
  @else { <form #form="ngForm" (ngSubmit)="submit(form)" class="checkout"><div>
    @for (line of cart.lines(); track line.product._id) { <section class="panel cart-item"><div class="row"><div><small class="muted">{{ line.product.sku }}</small><h2>{{ line.product.name }}</h2><p>{{ line.product.price | currency:'BRL' }} / unidade</p></div>@if (!directPurchase) { <button type="button" class="text-button" [disabled]="busy()" (click)="cart.remove(line.product._id)">Remover</button> }</div>
      <label>Quantidade<input type="number" [name]="'qty-' + line.product._id" [ngModel]="line.quantity" (ngModelChange)="cart.setQuantity(line.product._id, $event)" required min="1" max="10000" step="1" [disabled]="busy()"></label>
      @if (line.product.programming?.supported) {
        <label>Programação<select [name]="'type-' + line.product._id" [(ngModel)]="line.type" [disabled]="busy()"><option value="NONE">Sem programação</option><option value="STANDARD">Padrão</option><option value="AI">Com inteligência artificial</option><option value="CUSTOM">Personalizada</option></select></label>
        @if (line.type !== 'NONE') { <label>O que o dispositivo deve fazer?<textarea [name]="'req-' + line.product._id" [(ngModel)]="line.requirements" [required]="line.type === 'AI' || line.type === 'CUSTOM'" maxlength="10000" [disabled]="busy()" placeholder="Descreva sensores, ações e comportamento esperado."></textarea></label> }
      }
    </section> }
    </div><section class="panel summary"><h2>Resumo do pedido</h2><div class="row"><span>Produtos (estimativa)</span><strong>{{ total() | currency:'BRL' }}</strong></div><p class="muted">O valor final será calculado com os preços atuais do catálogo ao registrar o pedido.</p><p class="notice">{{ hasProgramming() ? 'A programação será analisada separadamente. Este pedido ficará pendente de atendimento.' : 'Após registrar o pedido, escolha Pix ou cartão na página de pagamento.' }}</p><button class="primary full" [disabled]="busy() || form.invalid">{{ busy() ? 'Registrando…' : session.token() ? (directPurchase && !hasProgramming() ? 'Ir para pagamento →' : 'Registrar pedido →') : 'Entrar para continuar →' }}</button><a class="back-link" routerLink="/catalogo">Continuar explorando</a></section>
  </form> }
` })
export class CartPage {
  profileReady = signal(false);
  private route = inject(ActivatedRoute);
  directPurchase = this.route.snapshot.paramMap.has('productId');
  cart = this.directPurchase ? new Cart() : inject(Cart);
  loading = signal(false);
  session = inject(Session); private api = inject(Api); private router = inject(Router); busy = signal(false); error = signal('');
  constructor() {
    if (this.directPurchase) {
      this.loading.set(true);
      this.api.get<Product[]>('products').subscribe({
        next: products => {
          const product = products.find(item => item._id === this.route.snapshot.paramMap.get('productId'));
          if (product) this.cart.add(product);
          this.loading.set(false);
        },
        error: e => { this.error.set(errorMessage(e)); this.loading.set(false); },
      });
    }
  }
  total() { return this.cart.lines().reduce((sum, l) => sum + Math.round(l.product.price * 100) * (l.quantity || 0), 0) / 100; }
  hasProgramming() { return this.cart.lines().some(line => line.type !== 'NONE'); }
  submit(form: NgForm) {
    if (this.busy() || form.invalid) return;
    if (!this.session.token()) { void this.router.navigate(['/login'], { queryParams: { returnUrl: this.router.url } }); return; }
    if (!this.profileReady()) { this.error.set('Preencha e salve os dados de entrega antes de registrar o pedido.'); return; }
    if (this.cart.lines().some(l => !Number.isInteger(l.quantity) || ((l.type === 'AI' || l.type === 'CUSTOM') && !l.requirements.trim()))) { this.error.set('Use quantidades inteiras e preencha os requisitos de programação.'); return; }
    this.busy.set(true); this.error.set('');
    const items = this.cart.lines().map(l => ({ productId: l.product._id, quantity: l.quantity, programmingRequest: { requested: l.type !== 'NONE', type: l.type, ...(l.type !== 'NONE' && l.requirements.trim() ? { requirements: l.requirements.trim() } : {}) } }));
    this.api.post<Order>('orders', { items }).subscribe({ next: order => { this.cart.clear(); void this.router.navigate([order.items.every(item => !item.programmingRequest.requested && item.programmingRequest.type === 'NONE') ? '/pagamento' : '/pedidos', order._id]); }, error: e => { this.error.set(errorMessage(e)); this.busy.set(false); } });
  }
}
