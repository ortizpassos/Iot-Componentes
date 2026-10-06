import { Component, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Api, errorMessage, resolveApiUrl } from './core';
import { StoreProject } from './project-store-model';
import { ProjectWorkspace } from './project-workspace';
@Component({
  imports: [RouterLink, ProjectWorkspace],
  template: `
    <p class="eyebrow">MEUS PROJETOS</p><h1>Meu Lab</h1>
    <p class="subtitle">Projetos grátis e projetos comprados. Abra as instruções e grave sua placa aqui mesmo.</p>
    @if (loading()) { <p role="status">Carregando seus projetos...</p> }
    @if (error()) { <p class="error" role="alert">{{ error() }}</p><button [disabled]="flashing()" (click)="load()">Tentar novamente</button> }
    @if (!loading() && !error()) {
      @for (group of groups; track group.label) {
        <section [attr.aria-label]="group.label"><h2>{{ group.label }}</h2><div class="product-grid">
          @for (p of grouped(group.free); track p._id) {
            <article class="panel">
              @if (p.images[0]) { <img [src]="image(p.images[0])" [alt]="p.name" loading="lazy"> }
              <h3>{{ p.name }}</h3><p>{{ p.isFree ? 'Disponível gratuitamente' : 'Compra liberada' }}</p>
              <button class="primary" [disabled]="flashing() || opening()" (click)="open(p._id)">Abrir no Meu Lab</button>
            </article>
          } @empty { <p>{{ group.free ? 'Nenhum projeto grátis disponível no momento.' : 'Seus projetos pagos aparecerão aqui após a confirmação do pagamento.' }}</p> }
        </div></section>
      }
      <p><a routerLink="/projetos">Explorar projetos</a></p>
    }
    @if (opening()) { <p role="status">Abrindo projeto...</p> }
    @if (detailError()) { <p class="error" role="alert">{{ detailError() }}</p> }
    @for (p of selected() ? [selected()!] : []; track p._id) {
      <section class="lab-project panel" aria-label="Projeto aberto" id="lab-project">
        <div class="row"><h2>{{ p.name }}</h2><button [disabled]="flashing()" (click)="selected.set(null)">Fechar projeto</button></div>
        <p class="requirements">{{ p.description }}</p>
        @if (p.videoUrl) { <p><a [href]="p.videoUrl" target="_blank" rel="noopener noreferrer">Assistir ao vídeo do projeto</a></p> }
        <div class="project-images">@for (id of p.images; track id) { <img [src]="image(id)" [alt]="p.name"> }</div>
        <app-project-workspace [project]="p" (busyChange)="flashing.set($event)" />
      </section>
    }
  `,
  styles: `img{width:100%;height:180px;object-fit:contain}article{min-width:0}h3{overflow-wrap:anywhere}.project-images{display:flex;flex-wrap:wrap;gap:12px}.project-images img{width:220px;max-width:100%}.lab-project{margin-top:24px}.row{display:flex;flex-wrap:wrap;gap:12px;justify-content:space-between}button{white-space:normal}`,
})
export class MyLabPage {
  private api = inject(Api); private route = inject(ActivatedRoute);
  projects = signal<StoreProject[]>([]); selected = signal<StoreProject | null>(null);
  loading = signal(false); error = signal(''); opening = signal(false); detailError = signal(''); flashing = signal(false);
  groups = [{ label: 'Grátis', free: true }, { label: 'Pagos', free: false }];
  grouped(free: boolean) { return this.projects().filter(p => !!p.isFree === free); }
  constructor() { void this.load(); }
  image(id: string) { return resolveApiUrl('/api/project-store/images/' + id); }
  async load() {
    if (this.flashing()) return;
    this.loading.set(true); this.error.set('');
    try {
      this.projects.set(await firstValueFrom(this.api.get<StoreProject[]>('project-store/mine')));
      const requested = this.route.snapshot.queryParamMap.get('projeto');
      if (requested && this.projects().some(p => p._id === requested) && !this.selected()) await this.open(requested);
    } catch (error) { this.error.set(errorMessage(error)); }
    finally { this.loading.set(false); }
  }
  async open(id: string) {
    if (this.flashing() || this.opening()) return;
    this.opening.set(true); this.detailError.set(''); this.selected.set(null);
    try {
      const project = await firstValueFrom(this.api.get<StoreProject>('project-store/' + id));
      if (!project.owned) throw new Error('Acesso ainda não liberado para este projeto.');
      this.selected.set(project);
      setTimeout(() => document.getElementById('lab-project')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
    } catch (error) { this.detailError.set(error instanceof HttpErrorResponse ? errorMessage(error) : error instanceof Error ? error.message : errorMessage(error)); }
    finally { this.opening.set(false); }
  }
}
