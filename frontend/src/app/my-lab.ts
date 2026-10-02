import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Api, errorMessage, resolveApiUrl } from './core';
import { StoreProject } from './project-store-model';

@Component({
  imports: [RouterLink],
  template: `
    <p class="eyebrow">MEUS PROJETOS</p>
    <h1>Meu Lab</h1>
    <p class="subtitle">Seus projetos adquiridos, com instruções, manuais e gravação do ESP32.</p>
    @if (loading()) { <p role="status">Carregando seus projetos...</p> }
    @if (error()) { <p class="error" role="alert">{{ error() }}</p><button (click)="load()">Tentar novamente</button> }
    @if (!loading() && !error()) {
      <div class="product-grid">
        @for (p of projects(); track p._id) {
          <article class="panel">
            @if (p.images[0]) { <a [routerLink]="['/projetos', p._id]"><img [src]="image(p.images[0])" [alt]="p.name" loading="lazy"></a> }
            <h2><a [routerLink]="['/projetos', p._id]">{{ p.name }}</a></h2>
            <p>Acesso liberado</p>
            <a class="button primary" [routerLink]="['/projetos', p._id]">Abrir instruções e gravar</a>
          </article>
        } @empty {
          <section class="panel"><h2>Seu laboratório começa aqui</h2><p>Seus projetos aparecerão aqui após a confirmação do pagamento.</p><a class="button primary" routerLink="/projetos">Explorar projetos</a></section>
        }
      </div>
    }
  `,
  styles: `img{width:100%;height:180px;object-fit:contain}article{min-width:0}h2{font-size:1.25rem;overflow-wrap:anywhere}.button{white-space:normal}`,
})
export class MyLabPage {
  private api = inject(Api);
  projects = signal<StoreProject[]>([]);
  loading = signal(false);
  error = signal('');
  constructor() { void this.load(); }
  image(id: string) { return resolveApiUrl('/api/project-store/images/' + id); }
  async load() {
    this.loading.set(true); this.error.set('');
    try { this.projects.set(await firstValueFrom(this.api.get<StoreProject[]>('project-store/mine'))); }
    catch (error) { this.error.set(errorMessage(error)); }
    finally { this.loading.set(false); }
  }
}
