import { CurrencyPipe } from '@angular/common';
import { Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { StoreConfig, BannerSlide } from './store-config';
import { Api, Product, resolveApiUrl } from './core';
import { ProductImage } from './product-image';

@Component({ selector: 'app-store-banner', imports: [CurrencyPipe, ProductImage, RouterLink], template: `
  <section class="banner" aria-label="Novidades e avisos da loja" aria-roledescription="carrossel" (mouseenter)="hovered.set(true)" (mouseleave)="hovered.set(false)" (focusin)="onFocus($event)">
    <div class="slide-track" [style.transform]="'translateX(-' + (index() % heroSlideCount()) * 100 + '%)'">
    @if (offerProducts().length) {
        <div class="slide offer-hero-slide" role="group" aria-roledescription="slide" aria-label="Produtos em oferta">
          <div class="offer-hero-heading"><p class="eyebrow">OFERTAS ESPECIAIS</p><h2>{{ offerTitle() }}</h2><p class="description">Aproveite nossas ofertas selecionadas.</p></div>
          <div class="offer-products-window">
            <div class="offer-hero-products" [style.transform]="'translateX(calc(-' + offerIndex() + ' * (33.333% + 4px)))'">
            @for (product of offerWindowProducts(); track $index) {
              <a class="banner-product offer-product" [routerLink]="product.storeProjectId ? ['/projetos', product.storeProjectId] : ['/produto', product._id]" [attr.aria-label]="'Ver oferta de ' + product.name">
                <span class="banner-product-image"><app-product-image [src]="product.imageUrl || ''" [alt]="product.name" /></span>
                <span class="banner-product-info"><strong>{{ product.name }}</strong><span>{{ product.price | currency:'BRL' }}</span><small>{{ offerDescription(product) }}</small></span>
              </a>
            }
            </div>
          </div>
        </div>
    } @else {
      @for (slide of slides(); track $index; let i = $index) {
        <div class="slide" [class.with-image]="slide.imageUrl && failedImage() !== slide.imageUrl" role="group" aria-roledescription="slide" [attr.aria-hidden]="i !== index() % heroSlideCount()" [attr.aria-label]="(i + 1) + ' de ' + slides().length">
          <div class="copy"><p class="eyebrow">NOVIDADES DA LOJA</p><h2>{{ slide.title }}</h2><p class="description">{{ slide.description }}</p></div>
          @if (slide.imageUrl && failedImage() !== slide.imageUrl) { <img [src]="resolveImageUrl(slide.imageUrl)" alt="" (error)="failedImage.set(slide.imageUrl)"> }
        </div>
      }
    }
    </div>
    @if (currentProducts().length) {
      <section class="product-carousel" aria-label="Produtos em destaque por categoria">
        <div class="product-carousel-heading">
          <div><p class="eyebrow">DESTAQUES DA CATEGORIA</p><h3>{{ currentCategory() }}</h3></div>
          @if (productSlides().length > 1) {
            <div class="product-dots" aria-label="Selecionar categoria">
              @for (products of productSlides(); track $index; let i = $index) {
                <button class="product-dot" type="button" [attr.aria-label]="'Ver categoria ' + productCategory(i)" [attr.aria-current]="i === productIndex() ? 'true' : null" (click)="selectProductCategory(i)"><span></span></button>
              }
            </div>
          }
        </div>
        <div class="product-window">
          <div class="product-track" [style.transform]="'translateX(-' + productIndex() * 100 + '%)'">
            @for (products of productSlides(); track $index) {
              <div class="product-slide">
                @for (product of products; track product._id) {
                  <a class="banner-product" [routerLink]="product.storeProjectId ? ['/projetos', product.storeProjectId] : ['/produto', product._id]" [attr.aria-label]="'Ver detalhes de ' + product.name">
                    <span class="banner-product-image"><app-product-image [src]="product.imageUrl || ''" [alt]="product.name" /></span>
                    <span class="banner-product-info"><strong>{{ product.name }}</strong><span>{{ product.price | currency:'BRL' }}</span></span>
                  </a>
                }
              </div>
            }
          </div>
        </div>
      </section>
    }
    @if (heroSlideCount() > 1) {
      <button class="arrow previous" type="button" aria-label="Banner anterior" (click)="move(-1)"><span aria-hidden="true">‹</span></button>
      <button class="arrow next" type="button" aria-label="Próximo banner" (click)="move(1)"><span aria-hidden="true">›</span></button>
      <div class="controls">
        <div class="dots" aria-label="Selecionar banner">@for (slide of heroSlides(); track $index; let i = $index) { <button class="dot-button" type="button" [attr.aria-label]="'Ir para banner ' + (i + 1)" [attr.aria-current]="i === index() % heroSlideCount() ? 'true' : null" (click)="select(i)"><span></span></button> }</div>
        <button class="rotation" type="button" [attr.aria-label]="paused() ? 'Retomar rotação' : 'Pausar rotação'" (click)="paused.set(!paused())"><span aria-hidden="true">{{ paused() ? '▶' : '❚❚' }}</span></button>
      </div>
    }
  </section>
`, styles: `
  :host{display:block;margin:0 0 30px;min-width:0}
  .banner{position:relative;background:#e5edf6;overflow:hidden;isolation:isolate}
  .slide-track{display:flex;transition:transform 600ms ease-in-out}
  .slide{position:relative;isolation:isolate;flex:0 0 100%;min-width:0;display:flex;align-items:center;min-height:300px;aspect-ratio:3.7/1;padding:36px 8% 64px;background:linear-gradient(110deg,#dce8f5,#f0f5fa)}
  .copy{position:relative;z-index:2;min-width:0;max-width:55%}
  h2{font-size:clamp(26px,3.3vw,46px);line-height:1.12;margin:12px 0;overflow-wrap:anywhere}
  .description{font-size:clamp(13px,1.3vw,17px);color:var(--muted);white-space:pre-wrap;overflow-wrap:anywhere;margin:0}
  img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center;z-index:0}
  .with-image::after{content:'';position:absolute;inset:0;z-index:1;background:linear-gradient(90deg,rgba(12,27,45,.75),rgba(12,27,45,.22) 55%,transparent 80%)}
  .with-image h2,.with-image .description,.with-image .eyebrow{color:#fff}
  .product-carousel{position:relative;z-index:3;padding:17px clamp(18px,5%,55px) 20px;background:#fff;border-top:1px solid #dce3ec}
  .offer-hero-slide{display:block;padding:28px clamp(18px,5%,55px) 30px;background:linear-gradient(110deg,#e8f5ec,#f7fcf8)}
  .offer-hero-heading{margin-bottom:16px}
  .offer-hero-heading h2{margin:7px 0;font-size:clamp(25px,3vw,40px)}
  .offer-products-window{overflow:hidden}
  .offer-hero-products{display:flex;gap:12px;transition:transform 600ms ease-in-out}
  .offer-hero-products>.offer-product{flex:0 0 calc((100% - 24px)/3)}
  .offer-product{border-color:#b9ddc3;background:#f6fcf7}
  .offer-product .banner-product-info>span{color:#16803c}
  .offer-product .banner-product-info small{font-size:10px;color:#16803c;font-weight:700}
  .product-carousel-heading{display:flex;align-items:center;justify-content:space-between;gap:15px;margin-bottom:12px}
  .product-carousel h3{margin:3px 0 0;font-size:19px}
  .product-window{overflow:hidden}
  .product-track{display:flex;transition:transform 600ms ease-in-out}
  .product-slide{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;flex:0 0 100%;min-width:0}
  .banner-product{display:flex;align-items:center;min-width:0;gap:10px;padding:8px;border:1px solid #dce3ec;border-radius:8px;color:inherit;background:#f8fafc;transition:transform 180ms ease,box-shadow 180ms ease}
  .banner-product:hover{transform:translateY(-2px);box-shadow:0 4px 12px #14263c1c}
  .banner-product-image{display:block;width:60px;height:60px;flex:0 0 60px;background:#edf2f8;border-radius:6px;overflow:hidden}
  .banner-product-info{display:grid;gap:5px;min-width:0}
  .banner-product-info strong{font-size:12px;line-height:1.25;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .banner-product-info>span{font-size:15px;font-weight:800;color:var(--primary)}
  .product-dots{display:flex;gap:4px}
  .product-dot{width:24px;height:24px;padding:0;border:0;background:transparent;display:grid;place-items:center}
  .product-dot span{width:7px;height:7px;border-radius:50%;background:#c5d1df}
  .product-dot[aria-current=true] span{background:var(--primary);transform:scale(1.25)}
  .banner::after{content:'';position:absolute;bottom:0;left:0;right:0;height:35px;background:linear-gradient(transparent,#f1f4f8);pointer-events:none;z-index:2}
  .arrow{position:absolute;top:50%;transform:translateY(-50%);z-index:3;width:44px;height:72px;padding:0;border:0;background:#fffffff2;color:var(--primary);box-shadow:0 2px 8px #14263c26;font-size:46px;font-weight:300;line-height:1}
  .previous{left:0;border-radius:0 6px 6px 0}.next{right:0;border-radius:6px 0 0 6px}
  .controls{position:absolute;bottom:24px;left:50%;transform:translateX(-50%);z-index:3;display:flex;align-items:center;gap:8px}
  .dots{display:flex;flex-wrap:wrap;justify-content:center;background:#14263c66;border-radius:20px;padding:0 6px;max-width:260px}
  .dot-button{display:grid;place-items:center;width:24px;height:32px;padding:0;border:0;background:transparent}
  .dot-button span{width:7px;height:7px;border-radius:50%;background:#ffffff80;border:1px solid #fff}.dot-button[aria-current=true] span{background:#fff;transform:scale(1.25)}
  .rotation{width:32px;height:32px;padding:0;border:1px solid #ffffff80;border-radius:50%;background:#14263c80;color:#fff;font-size:10px}
  @media(max-width:700px){.slide{aspect-ratio:auto;min-height:270px;padding:30px 46px 78px}.copy{max-width:100%}.arrow{width:30px;height:54px;font-size:34px}.with-image::after{background:linear-gradient(90deg,#0c1b2dbf,#0c1b2d40)}.controls{width:calc(100% - 70px);justify-content:center}.dots{max-width:240px}.dot-button{width:20px}.rotation{flex-shrink:0}.product-carousel{padding-inline:14px}.product-slide{gap:7px}.banner-product{display:grid;gap:4px;padding:6px}.banner-product-image{width:100%;height:62px}.banner-product-info strong{font-size:10px}.banner-product-info>span{font-size:12px}}
  @media(prefers-reduced-motion:reduce){.slide-track,.product-track{transition:none}}

` })
export class StoreBanner {
  private store = inject(StoreConfig); private api = inject(Api); private destroy = inject(DestroyRef);
  index = signal(0); hovered = signal(false); paused = signal(window.matchMedia('(prefers-reduced-motion: reduce)').matches); failedImage = signal('');
  productIndex = signal(0); products = signal<Product[]>([]);
  resolveImageUrl(value: string) { return resolveApiUrl(value); }
  slides = computed(() => {
    const value = this.store.value();
    const slides: BannerSlide[] = value.bannerSlides?.length ? [...value.bannerSlides] : [{ title: value.bannerTitle, description: value.bannerDescription, imageUrl: '' }];
    if (value.announcement.trim()) slides.unshift({ title: 'Aviso aos clientes', description: value.announcement, imageUrl: '' });
    const offer = value.globalOffer;
    if (offer?.enabled && (!offer.expiresAt || new Date(offer.expiresAt).getTime() > Date.now())) slides.unshift({ title: offer.title || 'Oferta especial', description: [offer.description, offer.discountEnabled !== false && offer.discountPercent ? `Desconto de ${offer.discountPercent}%` : '', offer.freeShipping ? (offer.freeShippingMinimum ? `Frete grátis acima de R$ ${offer.freeShippingMinimum.toFixed(2).replace('.', ',')}` : 'Frete grátis') : '', offer.gift ? `Brinde: ${offer.gift}` : ''].filter(Boolean).join(' · '), imageUrl: '' });
    return slides;
  });
  productSlides = computed(() => {
    const groups = new Map<string, Product[]>();
    for (const product of this.products()) {
      const group = groups.get(product.type) || [];
      group.push(product);
      groups.set(product.type, group);
    }
    return [...groups.values()].map(products => products.slice(0, 3));
  });
  currentProducts = computed(() => this.productSlides()[this.productIndex()] || []);
  currentCategory = computed(() => this.productCategory(this.productIndex()));
  offerProducts = computed(() => {
    const global = this.store.value().globalOffer;
    const globalActive = !!global?.enabled && (!global.expiresAt || new Date(global.expiresAt).getTime() > Date.now());
    return this.products().filter(product => {
      const offer = product.offer;
      const productActive = !!offer?.enabled && (!offer.expiresAt || new Date(offer.expiresAt).getTime() > Date.now());
      const activeOffer = productActive ? offer : globalActive ? global : undefined;
      return !!activeOffer && this.offerMeetsMinimum(product, activeOffer) && product.stock > 0;
    });
  });
  offerWindowProducts = computed(() => {
    const products = this.offerProducts();
    return products.length > 1 ? [...products, ...products.slice(0, 2)] : products;
  });
  offerIndex = signal(0);
  heroSlides = computed(() => this.offerProducts().length ? [{ title: this.offerTitle(), description: 'Produtos em oferta', imageUrl: '' }] : this.slides());
  heroSlideCount = computed(() => this.heroSlides().length || 1);
  offerTitle = computed(() => this.store.value().globalOffer?.title || 'Produtos selecionados');
  constructor() {
    this.api.get<Product[]>('products').subscribe({ next: products => this.products.set(products), error: () => undefined });
    const visibility = () => { if (document.hidden) this.paused.set(true); };
    document.addEventListener('visibilitychange', visibility); this.destroy.onDestroy(() => document.removeEventListener('visibilitychange', visibility));
    effect(onCleanup => {
      const seconds = this.store.value().bannerInterval || 6;
      const count = this.heroSlideCount();
      if (this.paused() || this.hovered() || count < 2) return;
      const timer = setInterval(() => this.index.update(index => (index + 1) % count), seconds * 1000);
      onCleanup(() => clearInterval(timer));
    });
    effect(onCleanup => {
      const seconds = this.store.value().bannerInterval || 6;
      const count = this.productSlides().length;
      if (this.paused() || this.hovered() || count < 2) return;
      const timer = setInterval(() => this.productIndex.update(index => (index + 1) % count), seconds * 1000);
      onCleanup(() => clearInterval(timer));
    });
    effect(onCleanup => {
      const seconds = this.store.value().bannerInterval || 6;
      const count = this.offerProducts().length;
      if (this.paused() || this.hovered() || count < 2) return;
      const timer = setInterval(() => this.offerIndex.update(index => (index + 1) % count), seconds * 1000);
      onCleanup(() => clearInterval(timer));
    });
  }
  productCategory(index: number) {
    const type = this.productSlides()[index]?.[0]?.type;
    return ({ BOARD: 'Displays', SENSOR: 'Sensores', MODULE: 'Módulos', KIT: 'Kits', ACCESSORY: 'Acessórios', SERVICE: 'Serviços', MICROCONTROLLER_PIC: 'Microcontroladores PIC', ESP32: 'ESP32', SEMICONDUCTOR: 'Semicondutores', SMART_HOME: 'Casa Inteligente' } as Record<string, string>)[type || ''] || type || 'Produtos';
  }
  offerDescription(product: Product) {
    const offer = product.offer;
    const global = this.store.value().globalOffer;
    if (offer?.enabled && offer.title) return offer.title;
    if (global?.enabled && global.title) return global.title;
    const discount = offer?.discountPercent || global?.discountPercent;
    return discount ? `${discount}% OFF` : 'Oferta especial';
  }
  private offerMeetsMinimum(product: Product, offer: { freeShipping?: boolean; freeShippingMinimum?: number }) {
    return !offer.freeShipping || !offer.freeShippingMinimum || product.price >= offer.freeShippingMinimum;
  }
  selectProductCategory(index: number) { this.paused.set(true); this.productIndex.set(index); }
  select(index: number) { this.paused.set(true); this.index.set(index); }
  move(direction: number) { this.paused.set(true); this.index.update(index => (index + direction + this.heroSlideCount()) % this.heroSlideCount()); }
  onFocus(event: FocusEvent) { if ((event.target as HTMLElement).matches(':focus-visible')) this.paused.set(true); }
}
