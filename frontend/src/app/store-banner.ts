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
      <button class="arrow previous" type="button" aria-label="Banner anterior" (click)="move(-1)"><span aria-hidden="true">‹</span></button>
      <button class="arrow next" type="button" aria-label="Próximo banner" (click)="move(1)"><span aria-hidden="true">›</span></button>
      <div class="controls">
        <div class="dots" aria-label="Selecionar banner">@for (slide of slides(); track $index; let i = $index) { <button class="dot-button" type="button" [attr.aria-label]="'Ir para banner ' + (i + 1)" [attr.aria-current]="i === index() % slides().length ? 'true' : null" (click)="select(i)"><span></span></button> }</div>
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
  .banner::after{content:'';position:absolute;bottom:0;left:0;right:0;height:35px;background:linear-gradient(transparent,#f1f4f8);pointer-events:none;z-index:2}
  .arrow{position:absolute;top:50%;transform:translateY(-50%);z-index:3;width:44px;height:72px;padding:0;border:0;background:#fffffff2;color:var(--primary);box-shadow:0 2px 8px #14263c26;font-size:46px;font-weight:300;line-height:1}
  .previous{left:0;border-radius:0 6px 6px 0}.next{right:0;border-radius:6px 0 0 6px}
  .controls{position:absolute;bottom:24px;left:50%;transform:translateX(-50%);z-index:3;display:flex;align-items:center;gap:8px}
  .dots{display:flex;flex-wrap:wrap;justify-content:center;background:#14263c66;border-radius:20px;padding:0 6px;max-width:260px}
  .dot-button{display:grid;place-items:center;width:24px;height:32px;padding:0;border:0;background:transparent}
  .dot-button span{width:7px;height:7px;border-radius:50%;background:#ffffff80;border:1px solid #fff}.dot-button[aria-current=true] span{background:#fff;transform:scale(1.25)}
  .rotation{width:32px;height:32px;padding:0;border:1px solid #ffffff80;border-radius:50%;background:#14263c80;color:#fff;font-size:10px}
  @media(max-width:700px){.slide{aspect-ratio:auto;min-height:270px;padding:30px 46px 78px}.copy{max-width:100%}.arrow{width:30px;height:54px;font-size:34px}.with-image::after{background:linear-gradient(90deg,#0c1b2dbf,#0c1b2d40)}.controls{width:calc(100% - 70px);justify-content:center}.dots{max-width:240px}.dot-button{width:20px}.rotation{flex-shrink:0}}
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
  select(index: number) { this.paused.set(true); this.index.set(index); }
  move(direction: number) { this.paused.set(true); this.index.update(index => (index + direction + this.slides().length) % this.slides().length); }
  onFocus(event: FocusEvent) { if ((event.target as HTMLElement).matches(':focus-visible')) this.paused.set(true); }
}
