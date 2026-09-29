import { Component, input, signal } from '@angular/core';
import { resolveApiUrl } from './core';

@Component({
  selector: 'app-product-image',
  template: `
    @if (src() && failed() !== src()) {
      <img [src]="imageUrl()" [alt]="alt()" loading="lazy" referrerpolicy="no-referrer" (error)="failed.set(src())">
    } @else {
      <div class="placeholder" role="img" [attr.aria-label]="src() ? 'Imagem indisponível' : 'Produto sem imagem'">
        <span aria-hidden="true">▦</span>@if (src()) { <small>Imagem indisponível</small> }
      </div>
    }
  `,
  styles: `:host{display:block;width:100%;height:100%;min-height:0}img{display:block;width:100%;height:100%;object-fit:contain;padding:12px}.placeholder{display:flex;height:100%;min-height:80px;flex-direction:column;justify-content:center;align-items:center;color:var(--primary)}.placeholder>span{font:70px monospace}.placeholder small{font-size:11px;color:var(--muted)}`,
})
export class ProductImage {
  src = input(''); alt = input('Imagem do produto'); failed = signal('');
  imageUrl() { return resolveApiUrl(this.src()); }
}
