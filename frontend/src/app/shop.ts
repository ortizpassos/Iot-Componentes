import { CartPersistence } from './cart-persistence';
import { toSignal } from '@angular/core/rxjs-interop';
import { CATALOG_CATEGORIES } from './catalog-categories';
import { Component, computed, inject, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { FormsModule, NgForm } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Api, Cart, Order, Product, Session, ShippingQuote, errorMessage } from './core';
import { catchError, forkJoin, of } from 'rxjs';
import { StoreConfig } from './store-config';
import { ProductImage } from './product-image';
import { CheckoutProfile, CheckoutProfileForm } from './checkout-profile';
import { StoreBanner } from './store-banner';

@Component({ imports: [CurrencyPipe, FormsModule, RouterLink, ProductImage, StoreBanner], template: `
  <app-store-banner />
  <div class="page-heading"><div><p class="eyebrow">EXPLORE. CONECTE. CRIE.</p><h1>{{ store.value().catalogTitle }}</h1><p class="subtitle">{{ store.value().catalogDescription }}</p></div></div>
  @if (store.value().contactEmail) { <p class="muted">Contato: <a [href]="'mailto:' + store.value().contactEmail">{{ store.value().contactEmail }}</a></p> }
  <div class="toolbar"><h2>Catálogo <small>{{ filtered().length }} produtos</small></h2></div>
  @if (message()) { <p class="notice" role="status">{{ message() }}</p> }
  @if (loading()) { <p class="empty" role="status">Carregando catálogo…</p> }
  @else if (error()) { <div class="error" role="alert">{{ error() }} <button (click)="load()">Tentar novamente</button></div> }
  @else { <div class="product-grid">@for (product of filtered(); track product._id) {
    <article class="product-card"><a class="product-visual" [routerLink]="product.storeProjectId ? ['/projetos', product.storeProjectId] : ['/produto', product._id]" [attr.aria-label]="'Ver detalhes de ' + product.name"><span class="product-type">{{ product.storeProjectId ? (product.deliveryKind === 'DIGITAL' ? 'Projeto digital' : 'Dispositivo completo') : label(product.type) }}</span><app-product-image [src]="product.imageUrl || ''" [alt]="product.name" />@if (offerActive(product)) { <span class="offer-splash">Oferta especial!</span> }@if (product.programming?.supported) { <span class="programmable">⌘ Programável</span> }</a>
      <div class="product-body"><small class="muted">{{ product.storeProjectId ? 'Projeto pronto' : product.manufacturer || product.sku }}</small>
        <h3><a class="product-title" [routerLink]="product.storeProjectId ? ['/projetos', product.storeProjectId] : ['/produto', product._id]">{{ product.name }}</a></h3>
        <button class="description-toggle text-button" (click)="toggleDescription(product._id)" [attr.aria-expanded]="expanded().has(product._id)" [attr.aria-controls]="'description-' + product._id">{{ expanded().has(product._id) ? 'Mostrar menos' : 'Mostrar mais' }}<span class="sr-only"> sobre {{ product.name }}</span></button>
        <p class="product-description" [id]="'description-' + product._id" [hidden]="!expanded().has(product._id)">{{ product.description || product.model || 'Componente para seu próximo projeto.' }}</p>
        <div class="product-bottom"><div><strong>{{ product.price | currency:'BRL' }}</strong>@if (offerActive(product)) { <small class="product-offer">{{ product.offer?.title || 'Oferta especial' }}@if (product.offer?.discountPercent) { · {{ product.offer?.discountPercent }}% OFF }@if (product.offer?.freeShipping) { · Frete grátis }</small> }@if (product.stock < 1) { <span class="sold-out">Esgotado!</span> } @else if (product.deliveryKind === 'DIGITAL') { <small class="muted">Acesso digital após o pagamento</small> } @else { <small class="muted">{{ product.stock }} em estoque</small> }@if (shippingPrices()[product._id] !== undefined && shippingPrices()[product._id] !== null) { <small class="shipping-price">Frete desde {{ shippingPrices()[product._id] | currency:'BRL' }}</small> }</div><button class="secondary" [disabled]="!cart.canAdd(product)" (click)="add(product)" [attr.aria-label]="'Adicionar ' + product.name">Adicionar +</button></div><button class="primary full" [disabled]="product.stock < 1" (click)="buyNow(product)" [attr.aria-label]="'Comprar agora ' + product.name">Comprar agora</button></div>
    </article>
  } @empty { <p class="empty">Nenhum produto encontrado. Tente outra busca ou aguarde novos componentes.</p> }</div> }
`, styles: `.product-title{padding:0;border:0;border-radius:0;background:transparent;text-align:left;font:inherit;color:inherit;overflow-wrap:anywhere}.description-toggle{padding:4px 0;text-decoration:underline}.product-description{white-space:pre-wrap;overflow-wrap:anywhere}.product-grid{align-items:start}.shipping-price{color:var(--primary);font-weight:600}.product-offer{display:block;color:var(--primary);font-weight:700}.offer-splash{position:absolute;top:14px;right:14px;z-index:3;padding:8px 10px;background:#16803c;color:#fff;font-size:12px;font-weight:800;letter-spacing:.2px;box-shadow:0 3px 9px #102a1c4d;transform:rotate(3deg)}.sold-out{display:block;color:var(--danger,#b42318);font-weight:700}` })
export class CatalogPage {
  private categoryParams = toSignal(inject(ActivatedRoute).queryParamMap);
  expanded = signal<Set<string>>(new Set());
  toggleDescription(id: string) { this.expanded.update(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }
  store = inject(StoreConfig);
  private api = inject(Api); cart = inject(Cart); session = inject(Session); private router = inject(Router);
  products = signal<Product[]>([]); shippingPrices = signal<Record<string, number | null>>({}); loading = signal(true); error = signal(''); message = signal(''); query = computed(() => this.categoryParams()?.get('busca') || ''); filter = computed(() => { const value = this.categoryParams()?.get('categoria') || ''; return CATALOG_CATEGORIES.some(type => type.value === value) ? value : ''; });
  types = CATALOG_CATEGORIES;
  filtered = computed(() => this.products().filter(p => (!this.filter() || p.type === this.filter()) && `${p.name} ${p.sku} ${p.model || ''} ${p.manufacturer || ''}`.toLocaleLowerCase().includes(this.query().toLocaleLowerCase())));
  constructor() { this.load(); }
  label(type: string) { return this.types.find(t => t.value === type)?.label || type; }
  offerActive(product: Product) { const global = this.store.value().globalOffer; return (!!product.offer?.enabled && (!product.offer.expiresAt || new Date(product.offer.expiresAt).getTime() > Date.now())) || (!!global?.enabled && (!global.expiresAt || new Date(global.expiresAt).getTime() > Date.now())); }
  load() { this.loading.set(true); this.error.set(''); this.api.get<Product[]>('products').subscribe({ next: data => { this.products.set(data); this.loading.set(false); this.loadCatalogShipping(data.filter(p => p.deliveryKind !== 'DIGITAL')); }, error: e => { this.error.set(errorMessage(e)); this.loading.set(false); } }); }
  private loadCatalogShipping(products: Product[]) {
    if (!this.session.token()) return;
    this.api.get<{ profile: CheckoutProfile | null }>('users/me/checkout-profile').subscribe({ next: data => {
      const zipCode = data.profile?.address.zipCode.replace(/\D/g, '');
      if (!zipCode) return;
      forkJoin(products.map(product => this.api.post<ShippingQuote>('shipping/quote', { destinationZipCode: zipCode, items: [{ productId: product._id, quantity: 1 }] }).pipe(catchError(() => of(null))))).subscribe(results => {
        const prices: Record<string, number | null> = {};
        products.forEach((product, index) => { const services = results[index]?.services || []; prices[product._id] = services.length ? Math.min(...services.map(service => service.price)) : null; });
        this.shippingPrices.set(prices);
      });
    }, error: () => undefined });
  }
  buyNow(product: Product) { if (product.stock < 1) return; void this.router.navigate(['/finalizar-compra', product._id]); }
  add(product: Product) { if (!this.cart.add(product)) return; this.message.set(`${product.name} adicionado ao carrinho.`); }
}

@Component({ imports: [FormsModule, CurrencyPipe, RouterLink, CheckoutProfileForm], template: `
  <p class="eyebrow">SEU PRÓXIMO PROJETO</p><h1>{{ directPurchase ? 'Finalizar compra' : 'Carrinho' }}</h1><p class="subtitle">Revise os componentes e conte o que você quer construir.</p>
  @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
  @if (session.token() && cart.lines().length) { <app-checkout-profile (ready)="onProfileReady($event)" /> }
  @if (!directPurchase && cart.persistenceError()) { <p class="error" role="alert">{{ cart.persistenceError() }} <button type="button" (click)="persistence.retrySave()">Tentar novamente</button></p> }
  @if (loading() || cart.restoring()) { <p role="status">Carregando carrinho...</p> }
  @else if (!cart.lines().length) { <div class="panel empty"><h2>{{ directPurchase ? 'Produto indisponível' : 'Seu carrinho está vazio' }}</h2><p>Explore o catálogo para começar.</p><a class="button primary" routerLink="/catalogo">Explorar componentes</a></div> }
  @else { <form #form="ngForm" (ngSubmit)="submit(form)" class="checkout"><div>
    @for (line of cart.lines(); track line.product._id) { <section class="panel cart-item"><div class="row"><div><small class="muted">{{ line.product.sku }}</small><h2>{{ line.product.name }}</h2><p>{{ line.product.price | currency:'BRL' }} / unidade</p></div>@if (!directPurchase) { <button type="button" class="text-button" [disabled]="busy()" (click)="cart.remove(line.product._id)">Remover</button> }</div>
      <label>Quantidade<input type="number" [name]="'qty-' + line.product._id" [ngModel]="line.quantity" (ngModelChange)="cart.setQuantity(line.product._id, $event)" required min="1" [max]="line.product.stock" step="1" [disabled]="busy()"></label>
      <p class="muted">Disponível: {{ line.product.stock }} unidade(s).</p>
      @if (line.quantity > line.product.stock) { <p class="error" role="alert">A quantidade excede o estoque disponível.</p> }
    </section> }
    </div><section class="panel summary"><h2>Resumo do pedido</h2><div class="row"><span>Produtos (estimativa)</span><strong>{{ total() | currency:'BRL' }}</strong></div>
      @if (profileReady() && requiresShipping()) { <div class="shipping-quote"><div class="row"><h3>Frete</h3><button type="button" class="text-button" [disabled]="shippingBusy()" (click)="recalculateShipping()">{{ shippingBusy() ? 'Consultando…' : 'Recalcular' }}</button></div>@if (shippingError()) { <p class="error" role="alert">{{ shippingError() }}</p> } @if (shippingQuote(); as quote) { @for (service of quote.services; track service.code) { <label class="shipping-option"><span><input type="radio" name="shippingService" [checked]="selectedShippingCode() === service.code" (change)="selectShipping(service.code)"> {{ service.name }}{{ service.deliveryDays ? ' · até ' + service.deliveryDays + ' dias úteis' : '' }}</span><strong>{{ service.price | currency:'BRL' }}</strong></label> } } @else if (!shippingBusy() && !shippingError()) { <p class="muted">Informe o CEP para consultar as modalidades de envio.</p> }</div> }
      @if (hasOffer() && itemDiscountTotal()) { <div class="row"><span>Descontos da oferta</span><strong class="offer-saving">-{{ itemDiscountTotal() | currency:'BRL' }}</strong></div> }@if (hasOffer() && globalDiscount()) { <div class="row"><span>Desconto da oferta global</span><strong class="offer-saving">-{{ globalDiscount() | currency:'BRL' }}</strong></div> }@if (shippingPrice() !== null) { <div class="row"><span>Frete selecionado</span><strong>@if (hasOffer() && offerFreeShipping()) { <del>{{ shippingPrice() | currency:'BRL' }}</del> Grátis } @else { {{ shippingPrice() | currency:'BRL' }} }</strong></div> }@if (hasOffer()) { <div class="row total"><span>Total original</span><strong><del>{{ originalGrandTotal() | currency:'BRL' }}</del></strong></div><div class="row total"><span>Total com a oferta</span><strong>{{ offerGrandTotal() | currency:'BRL' }}</strong></div> } @else { <div class="row total"><span>Total estimado</span><strong>{{ grandTotal() | currency:'BRL' }}</strong></div> }<p class="muted">O frete exibido é uma estimativa da modalidade selecionada.</p><p class="notice">Após registrar o pedido, escolha Pix ou cartão na página de pagamento.</p><button class="primary full" [disabled]="busy() || form.invalid">{{ busy() ? 'Registrando…' : session.token() ? 'Ir para pagamento →' : 'Entrar para continuar →' }}</button><a class="back-link" routerLink="/catalogo">Continuar explorando</a></section>
  </form> }
`, styles: `.shipping-quote{margin:20px 0}.shipping-quote h3{margin:0}.shipping-quote .row{margin:8px 0}.shipping-option{display:flex;justify-content:space-between;gap:12px;margin:8px 0}.shipping-option input{width:auto}` })
export class CartPage {
  persistence = inject(CartPersistence);
  profileReady = signal(false);
  shippingBusy = signal(false); shippingError = signal(''); shippingQuote = signal<ShippingQuote | null>(null); selectedShippingCode = signal(''); private shippingZipCode = '';
  private route = inject(ActivatedRoute);
  directPurchase = this.route.snapshot.paramMap.has('productId');
  cart = this.directPurchase ? new Cart() : inject(Cart);
  loading = signal(false);
  session = inject(Session); private api = inject(Api); private router = inject(Router); busy = signal(false); error = signal('');
  store = inject(StoreConfig);
  constructor() {
    if (this.directPurchase) {
      this.loading.set(true);
      this.api.get<Product[]>('products').subscribe({
        next: products => {
          const product = products.find(item => item._id === this.route.snapshot.paramMap.get('productId'));
          if (product && product.stock > 0) this.cart.add(product);
          this.loading.set(false);
        },
        error: e => { this.error.set(errorMessage(e)); this.loading.set(false); },
      });
    }
  }
  requiresShipping() { return this.cart.lines().some(l => l.product.deliveryKind !== 'DIGITAL'); }
  total() { return this.cart.lines().reduce((sum, l) => sum + Math.round(l.product.price * 100) * (l.quantity || 0), 0) / 100; }
  shippingPrice() { const quote = this.shippingQuote(); const selected = quote?.services.find(service => service.code === this.selectedShippingCode()) || quote?.services.slice().sort((a, b) => a.price - b.price)[0]; return selected?.price ?? null; }
  grandTotal() { return this.total() + (this.shippingPrice() || 0); }
  activeOffer(product: Product) { const global = this.store.value().globalOffer; const productActive = !!product.offer?.enabled && (!product.offer.expiresAt || new Date(product.offer.expiresAt).getTime() > Date.now()); if (productActive) return product.offer; return !!global?.enabled && (!global.expiresAt || new Date(global.expiresAt).getTime() > Date.now()) ? global : undefined; }
  hasOffer() { return this.cart.lines().some(line => !!this.activeOffer(line.product)); }
  itemDiscountTotal() { return this.cart.lines().reduce((sum, line) => { const offer = line.product.offer; const active = !!offer?.enabled && (!offer.expiresAt || new Date(offer.expiresAt).getTime() > Date.now()); return sum + (active ? line.quantity * line.product.price * ((offer.discountPercent || 0) / 100) : 0); }, 0); }
  globalDiscount() { const offer = this.store.value().globalOffer; const active = !!offer?.enabled && offer.discountEnabled !== false && (!offer.expiresAt || new Date(offer.expiresAt).getTime() > Date.now()); return active ? (this.total() - this.itemDiscountTotal()) * ((offer.discountPercent || 0) / 100) : 0; }
  offerFreeShipping() { const global = this.store.value().globalOffer; const globalActive = !!global?.enabled && (!global.expiresAt || new Date(global.expiresAt).getTime() > Date.now()); const globalQualified = globalActive && !!global.freeShipping && (!global.freeShippingMinimum || this.total() >= global.freeShippingMinimum); return globalQualified || this.cart.lines().some(line => { const offer = line.product.offer; return !!offer?.enabled && (!offer.expiresAt || new Date(offer.expiresAt).getTime() > Date.now()) && !!offer.freeShipping; }); }
  originalGrandTotal() { return this.grandTotal(); }
  offerGrandTotal() { return Math.max(0, this.total() - this.itemDiscountTotal() - this.globalDiscount() + (this.offerFreeShipping() ? 0 : this.shippingPrice() || 0)); }
  hasProgramming() { return false; }
  selectShipping(code: string) { this.selectedShippingCode.set(code); }
  onProfileReady(profile: CheckoutProfile | null) {
    this.profileReady.set(!!profile); this.shippingQuote.set(null); this.selectedShippingCode.set(''); this.shippingError.set('');
    if (profile) { this.shippingZipCode = profile.address.zipCode.replace(/\D/g, ''); this.calculateShipping(); }
  }
  recalculateShipping() { if (!this.shippingBusy()) this.calculateShipping(); }
  calculateShipping() {
    if (!this.requiresShipping()) return;
    if (!this.shippingZipCode || !this.cart.lines().length) return;
    this.shippingBusy.set(true); this.shippingError.set('');
    this.api.post<ShippingQuote>('shipping/quote', { destinationZipCode: this.shippingZipCode, items: this.cart.lines().filter(line => line.product.deliveryKind !== 'DIGITAL').map(line => ({ productId: line.product._id, quantity: line.quantity })) }).subscribe({
      next: quote => { this.shippingQuote.set(quote); this.selectedShippingCode.set(quote.services.slice().sort((a, b) => a.price - b.price)[0]?.code || ''); this.shippingBusy.set(false); },
      error: error => { this.shippingError.set(errorMessage(error)); this.shippingBusy.set(false); },
    });
  }
  submit(form: NgForm) {
    if (this.busy() || form.invalid) return;
    if (!this.session.token()) { void this.router.navigate(['/login'], { queryParams: { returnUrl: this.router.url } }); return; }
    if (!this.profileReady()) { this.error.set('Preencha e salve os dados de entrega antes de registrar o pedido.'); return; }
    if (this.cart.lines().some(l => !Number.isInteger(l.quantity) || l.quantity < 1 || l.quantity > l.product.stock)) { this.error.set('Use quantidades inteiras dentro do estoque disponível.'); return; }
    this.busy.set(true); this.error.set('');
    if (this.requiresShipping() && (this.shippingPrice() === null || !this.selectedShippingCode())) { this.error.set('Calcule e selecione uma modalidade de frete antes de registrar o pedido.'); this.busy.set(false); return; }
    const items = this.cart.lines().map(l => ({ productId: l.product._id, quantity: l.quantity, programmingRequest: { requested: false, type: 'NONE' as const } }));
    this.api.post<Order>('orders', { items, ...(this.requiresShipping() ? { shippingServiceId: this.selectedShippingCode() } : {}) }).subscribe({ next: order => { this.cart.clear(); void this.router.navigate([order.items.every(item => !item.programmingRequest.requested && item.programmingRequest.type === 'NONE') ? '/pagamento' : '/pedidos', order._id]); }, error: e => { this.error.set(errorMessage(e)); this.busy.set(false); } });
  }
}
