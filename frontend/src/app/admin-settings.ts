import { Component, inject, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { Api, errorMessage } from './core';
import { StoreConfig, StoreValues, defaultStore } from './store-config';
import { ProductImage } from './product-image';
import { AdminSender } from './admin-sender';
@Component({ selector: 'app-admin-settings', imports: [FormsModule, ProductImage, AdminSender], template: `
  <section class="panel"><h2>Configurações da loja</h2><p class="muted">As alterações serão exibidas aos clientes ao abrir ou atualizar a loja.</p>
  @if (error()) { <p role="alert" class="error">{{ error() }} <button (click)="load()">Recarregar</button></p> }
  @if (saved()) { <p class="notice" role="status">Configurações publicadas na loja.</p> }
  @if (loading()) { <p role="status">Carregando configurações…</p> } @else {
    <form #form="ngForm" (ngSubmit)="save(form)"><fieldset [disabled]="busy() || !loaded()" style="border:0;padding:0;margin:0">
      <label>Nome da loja<input name="storeName" [(ngModel)]="value.storeName" required maxlength="60"></label>
      <label>Frase do cabeçalho<input name="tagline" [(ngModel)]="value.tagline" maxlength="120"></label>
      <label>Título do catálogo<input name="catalogTitle" [(ngModel)]="value.catalogTitle" required maxlength="120"></label>
      <label>Descrição do catálogo<textarea name="catalogDescription" [(ngModel)]="value.catalogDescription" maxlength="500"></textarea></label>
      <section class="banner-settings"><h2>Banner rotativo</h2><p class="muted">Adicione até 10 imagens com textos ou avisos. A ordem abaixo será usada na loja. Sem slides, será exibido o banner padrão.</p>
      <label>Intervalo entre slides (segundos)<input type="number" name="bannerInterval" [(ngModel)]="value.bannerInterval" required min="3" max="30" step="1"></label>
      @for (slide of value.bannerSlides; track slide; let i = $index) {
        <section class="slide-editor"><h3>Slide {{ i + 1 }}</h3>
          <label>Título do slide (obrigatório)<input [name]="'slide-title-' + i" [(ngModel)]="slide.title" required maxlength="120"></label>
          <label>Aviso ou descrição<textarea [name]="'slide-description-' + i" [(ngModel)]="slide.description" maxlength="500"></textarea></label>
          <label>Link da imagem (opcional)<input [name]="'slide-image-' + i" [(ngModel)]="slide.imageUrl" maxlength="2048" placeholder="https://..."></label>
          <label>Enviar imagem<input type="file" accept="image/jpeg,image/png,image/webp" (change)="upload($event, i)"></label>
          @if (slide.imageUrl) { <div class="banner-preview"><app-product-image [src]="slide.imageUrl" [alt]="slide.title" /></div><button type="button" (click)="slide.imageUrl = ''">Remover imagem</button> }
          <div class="slide-actions"><button type="button" [disabled]="i === 0" (click)="move(i, -1)">Mover para cima</button><button type="button" [disabled]="i === value.bannerSlides.length - 1" (click)="move(i, 1)">Mover para baixo</button><button type="button" (click)="value.bannerSlides.splice(i, 1)">Excluir slide</button></div>
        </section>
      }
      <button type="button" [disabled]="value.bannerSlides.length >= 10" (click)="addSlide()">Adicionar slide</button>
      @if (uploading()) { <p role="status">Enviando imagem…</p> }
      <h3>Banner padrão</h3><label>Título do banner<input name="bannerTitle" [(ngModel)]="value.bannerTitle" maxlength="120"></label>
      <label>Descrição do banner<textarea name="bannerDescription" [(ngModel)]="value.bannerDescription" maxlength="500"></textarea></label>
      <label>Aviso aos clientes (opcional)<textarea name="announcement" [(ngModel)]="value.announcement" maxlength="500"></textarea></label>
      <p class="muted">O aviso aos clientes aparece como o primeiro slide do banner. Para vários avisos, adicione slides acima.</p></section>
      <section class="panel"><h3>Oferta global no banner</h3><label class="check"><input name="globalOfferEnabled" type="checkbox" [(ngModel)]="value.globalOffer.enabled"> Mostrar oferta global no banner inicial</label>@if (value.globalOffer.enabled) { <label>Título da oferta<input name="globalOfferTitle" [(ngModel)]="value.globalOffer.title" required maxlength="120"></label><label>Descrição<textarea name="globalOfferDescription" [(ngModel)]="value.globalOffer.description" required maxlength="500"></textarea></label><label>Desconto (%)<input name="globalOfferDiscount" type="number" [(ngModel)]="value.globalOffer.discountPercent" min="0" max="100" step="1"></label><label class="check"><input name="globalOfferShipping" type="checkbox" [(ngModel)]="value.globalOffer.freeShipping"> Frete grátis</label><label>Brinde (opcional)<input name="globalOfferGift" [(ngModel)]="value.globalOffer.gift" maxlength="200"></label><label>Válida até<input name="globalOfferExpiresAt" type="date" [(ngModel)]="value.globalOffer.expiresAt"></label> }</section>
      <label>E-mail de contato<input name="contactEmail" type="email" email [(ngModel)]="value.contactEmail" maxlength="254"></label>
      @if (validation().length) { <div class="error" role="alert"><strong>Confira os campos abaixo para publicar:</strong><ul>@for (message of validation(); track message) { <li>{{ message }}</li> }</ul></div> }
      <button type="submit" class="primary" [disabled]="busy() || !loaded()">{{ uploading() ? 'Enviando imagem…' : busy() ? 'Publicando…' : 'Publicar configurações' }}</button>
    </fieldset></form>
  }</section>
  <app-admin-sender />
`, styles: `.banner-settings{border-top:1px solid var(--border);margin-top:28px;padding-top:24px}.slide-editor{border:1px solid var(--border);border-radius:10px;padding:20px;margin:20px 0}.slide-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:15px}.banner-preview{height:180px;max-width:400px;background:#edf2f8;margin:15px 0;border-radius:8px;overflow:hidden}` })
export class AdminSettings {
  private api = inject(Api); private store = inject(StoreConfig); value: StoreValues = structuredClone(defaultStore);
  uploading = signal(false);
  validation = signal<string[]>([]);
  validate(form: NgForm) {
    const messages: string[] = [];
    const labels: Record<string, string> = { storeName: 'Nome da loja', tagline: 'Frase do cabeçalho', catalogTitle: 'Título do catálogo', catalogDescription: 'Descrição do catálogo', bannerInterval: 'Intervalo entre slides', bannerTitle: 'Título do banner padrão', bannerDescription: 'Descrição do banner padrão', announcement: 'Aviso aos clientes', contactEmail: 'E-mail de contato' };
    for (const [name, control] of Object.entries(form.controls)) {
      if (!control.invalid) continue;
      const slide = /^slide-(title|description|image)-(\d+)$/.exec(name);
      const label = slide ? `Slide ${Number(slide[2]) + 1}: ${{ title: 'título', description: 'descrição', image: 'link da imagem' }[slide[1]]}` : labels[name] || name;
      messages.push(`${label}: ${control.hasError('required') ? 'preencha este campo.' : control.hasError('email') ? 'informe um e-mail válido ou deixe em branco.' : name === 'bannerInterval' ? 'use um número inteiro entre 3 e 30 segundos.' : 'confira o valor e o limite de caracteres.'}`);
    }
    if (!Number.isInteger(this.value.bannerInterval) && !form.controls['bannerInterval']?.invalid) messages.push('Intervalo entre slides: use um número inteiro entre 3 e 30 segundos.');
    if (this.value.storeName && !this.value.storeName.trim()) messages.push('Nome da loja: preencha um nome válido.');
    if (this.value.catalogTitle && !this.value.catalogTitle.trim()) messages.push('Título do catálogo: preencha um título válido.');
    this.value.bannerSlides.forEach((slide, index) => { if (slide.title && !slide.title.trim()) messages.push(`Slide ${index + 1}: preencha um título válido.`); });
    return messages;
  }
  addSlide() { this.value.bannerSlides.push({ title: '', description: '', imageUrl: '' }); this.saved.set(false); }
  move(index: number, direction: number) { const slides = this.value.bannerSlides; [slides[index], slides[index + direction]] = [slides[index + direction], slides[index]]; }
  upload(event: Event, index: number) {
    const input = event.target as HTMLInputElement; const file = input.files?.[0]; input.value = '';
    if (!file || this.busy()) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || !file.size || file.size > 5 * 1024 * 1024) { this.error.set('Selecione uma imagem JPG, PNG ou WebP de até 5 MB.'); return; }
    const slide = this.value.bannerSlides[index]; const body = new FormData(); body.append('image', file);
    this.busy.set(true); this.uploading.set(true); this.error.set(''); this.saved.set(false);
    this.api.post<{ imageUrl: string }>('admin/product-images', body).subscribe({ next: data => { slide.imageUrl = data.imageUrl; this.busy.set(false); this.uploading.set(false); }, error: e => { this.error.set(errorMessage(e)); this.busy.set(false); this.uploading.set(false); } });
  }
  loading = signal(true); busy = signal(false); error = signal(''); saved = signal(false); loaded = signal(false);
  constructor() { this.load(); }
  load() { this.loading.set(true); this.error.set(''); this.api.get<StoreValues>('settings').subscribe({ next: value => { this.value = structuredClone({ ...defaultStore, ...value }); this.loaded.set(true); this.loading.set(false); }, error: e => { this.loaded.set(false); this.error.set(errorMessage(e)); this.loading.set(false); } }); }
  save(form: NgForm) {
    if (this.busy() || !this.loaded()) return;
    this.saved.set(false); this.error.set(''); form.form.markAllAsTouched();
    const messages = this.validate(form); this.validation.set(messages);
    if (messages.length || form.invalid) return;
    this.busy.set(true);
    this.api.put<StoreValues>('settings', this.value).subscribe({ next: value => { this.store.value.set({ ...defaultStore, ...value }); this.value = structuredClone({ ...defaultStore, ...value }); this.saved.set(true); this.busy.set(false); }, error: e => { this.error.set(errorMessage(e)); this.busy.set(false); } });
  }
}
