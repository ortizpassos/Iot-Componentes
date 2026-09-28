import { Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { StoreConfig, BannerSlide } from './store-config';

@Component({ selector: 'app-store-banner', template: `
  <section class="banner" aria-label="Novidades e avisos da loja" aria-roledescription="carrossel" (mouseenter)="hovered.set(true)" (mouseleave)="hovered.set(false)" (focusin)="onFocus($event)">
    <div class="slide-track" [style.transform]="'translateX(-' + (index() % slides().length) * 100 + '%)'">
    @for (slide of slides(); track $index; let i = $index) {
      <div class="slide" [class.with-image]="slide.imageUrl && failedImage() !== slide.imageUrl" role="group" aria-roledescription="slide" [attr.aria-hidden]="i !== index() % slides().length" [attr.aria-label]="(i + 1) + ' de ' + slides().length">
        <div class="copy"><p class="eyebrow">NOVIDADES DA LOJA</p><h2>{{ slide.title }}</h2><p class="description">{{ slide.description }}</p></div>
        @if (slide.imageUrl && failedImage() !== slide.imageUrl) { <img [src]="slide.imageUrl" alt="" (error)="failedImage.set(slide.imageUrl)"> }
      </div>
    }
    </div>
    @if (slides().length > 1) {
      <div class="controls"><button type="button" aria-label="Banner anterior" (click)="move(-1)">←</button><span>{{ index() + 1 }} / {{ slides().length }}</span><button type="button" aria-label="Próximo banner" (click)="move(1)">→</button><button type="button" (click)="paused.set(!paused())">{{ paused() ? 'Retomar rotação' : 'Pausar rotação' }}</button></div>
    }
  </section>
`, styles: `
  :host{display:block;margin:4px 0 34px;min-width:0}
  .banner{position:relative;border:1px solid var(--border);background:#e5edf6;border-radius:14px;overflow:hidden}
  .slide-track{display:flex;transition:transform 600ms ease-in-out}
  .slide{position:relative;isolation:isolate;flex:0 0 100%;min-width:0;display:flex;align-items:center;min-height:360px;padding:36px 36px 100px;background:#e5edf6}
  .copy{position:relative;z-index:2;min-width:0;max-width:680px}
  h2{font-size:30px;line-height:1.2;margin:18px 0 12px;overflow-wrap:anywhere}
  .description{font-size:14px;color:var(--muted);white-space:pre-wrap;overflow-wrap:anywhere;margin:0}
  img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center;z-index:0}
  .with-image::after{content:'';position:absolute;inset:0;z-index:1;background:linear-gradient(90deg,rgba(12,27,45,.85),rgba(12,27,45,.5))}
  .with-image h2,.with-image .description,.with-image .eyebrow{color:#fff}
  .controls{position:absolute;bottom:0;left:0;right:0;z-index:3;display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:12px;padding:12px 16px;background:rgba(20,38,60,.85);color:#fff;font-size:12px}
  .controls button{font-size:12px;background:#fff;color:#20334a}
  @media(max-width:700px){.slide{min-height:320px;padding:24px 20px 110px}h2{font-size:24px}.controls{gap:8px}.controls button{padding:8px 10px}}
  @media(prefers-reduced-motion:reduce){.slide-track{transition:none}}
` })
export class StoreBanner {
  private store = inject(StoreConfig); private destroy = inject(DestroyRef);
  index = signal(0); hovered = signal(false); paused = signal(window.matchMedia('(prefers-reduced-motion: reduce)').matches); failedImage = signal('');
  slides = computed(() => {
    const value = this.store.value();
    const slides: BannerSlide[] = value.bannerSlides?.length ? [...value.bannerSlides] : [{ title: value.bannerTitle, description: value.bannerDescription, imageUrl: '' }];
    if (value.announcement.trim()) slides.unshift({ title: 'Aviso aos clientes', description: value.announcement, imageUrl: '' });
    return slides;
  });
  constructor() {
    const visibility = () => { if (document.hidden) this.paused.set(true); };
    document.addEventListener('visibilitychange', visibility); this.destroy.onDestroy(() => document.removeEventListener('visibilitychange', visibility));
    effect(onCleanup => {
      const seconds = this.store.value().bannerInterval || 6;
      const count = this.slides().length;
      if (this.paused() || this.hovered() || count < 2) return;
      const timer = setInterval(() => this.index.update(index => (index + 1) % count), seconds * 1000);
      onCleanup(() => clearInterval(timer));
    });
  }
  move(direction: number) { this.paused.set(true); this.index.update(index => (index + direction + this.slides().length) % this.slides().length); }
  onFocus(event: FocusEvent) { if ((event.target as HTMLElement).matches(':focus-visible')) this.paused.set(true); }
}
