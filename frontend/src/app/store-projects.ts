import { Component, inject, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Api, errorMessage, resolveApiUrl } from './core';
import { StoreProject } from './project-store-model';
import { ProjectWorkspace } from './project-workspace';
@Component({ imports: [CurrencyPipe, RouterLink], template: `
<p class="eyebrow">PROJETOS PRONTOS</p><h1>Projetos</h1><p class="subtitle">Escolha o projeto digital para gravar sua placa ou receba o dispositivo completo já programado.</p>
@if (error()) { <p class="error" role="alert">{{ error() }} <button (click)="load()">Tentar novamente</button></p> }
@if (loading()) { <p role="status">Carregando projetos...</p> }
<h2 style="margin-top:32px">Projetos disponíveis</h2>@for (group of groups; track group.label) { <section [attr.aria-label]="group.label"><h3>{{ group.label }}</h3><div class="product-grid">@for (p of grouped(group.free); track p._id) { <article class="panel">@if (p.images[0]) { <a [routerLink]="['/projetos',p._id]"><img [src]="image(p.images[0])" [alt]="p.name" style="width:100%;height:180px;object-fit:contain"></a> }<h3><a [routerLink]="['/projetos',p._id]">{{ p.name }}</a></h3>@if (p.isFree) { <p>Projeto digital grátis</p> } @else { <p>Projeto digital: {{ p.digitalPrice | currency:'BRL' }}</p> }@if (p.completeEnabled) { <p>Dispositivo completo: {{ p.completePrice | currency:'BRL' }}</p> }<a class="button primary" [routerLink]="p.isFree ? ['/meu-lab'] : ['/projetos',p._id]" [queryParams]="p.isFree ? {projeto:p._id} : {}">{{ p.isFree ? 'Abrir no Meu Lab' : 'Ver detalhes e opções' }}</a></article> } @empty { @if (!loading()) { <p>Nenhum projeto publicado.</p> } }</div></section> }
` })
export class StoreProjectsPage {
  groups = [{ label: 'Grátis', free: true }, { label: 'Pagos', free: false }];
  grouped(free: boolean) { return this.catalog().filter(p => !!p.isFree === free); }
  private api = inject(Api); catalog = signal<StoreProject[]>([]); error = signal(''); loading = signal(false);
  constructor() { this.load(); }
  image(id: string) { return resolveApiUrl('/api/project-store/images/' + id); }
  async load() { this.loading.set(true); this.error.set(''); try { this.catalog.set(await firstValueFrom(this.api.get<StoreProject[]>('project-store'))); } catch (e) { this.error.set(errorMessage(e)); } finally { this.loading.set(false); } }
}
@Component({ imports: [CurrencyPipe, RouterLink, ProjectWorkspace], template: `
<a routerLink="/projetos">← Todos os projetos</a> @if (project()?.owned) { <span> · </span><a routerLink="/meu-lab">Meu Lab</a> }
@if (error()) { <p role="alert" class="error">{{ error() }}</p> }
@if (!project() && !error()) { <p role="status">Carregando projeto...</p> }
@if (project(); as p) {
<h1>{{ p.name }}</h1><div class="project-images">@for (id of p.images; track id) { <img [src]="image(id)" [alt]="p.name"> }</div><p class="requirements">{{ p.description }}</p>
@if (p.videoUrl) { <p><a [href]="p.videoUrl" target="_blank" rel="noopener noreferrer">Assistir ao vídeo do projeto</a></p> }
@if (p.active) { <div class="project-options"><section class="panel"><h2>Apenas o projeto</h2><p>Instruções, manuais e gravação na sua placa compatível. Sem envio de dispositivo.</p>@if (p.isFree) { <strong>Grátis</strong><p><a class="button primary" routerLink="/meu-lab" [queryParams]="{projeto:p._id}">Abrir no Meu Lab</a></p> } @else { <strong>{{ p.digitalPrice | currency:'BRL' }}</strong><p><a class="button primary" [routerLink]="['/finalizar-compra', p.digitalProductId]">Comprar projeto digital</a></p> }</section>
@if (p.completeEnabled) { <section class="panel"><h2>Dispositivo completo</h2><p>Receba o dispositivo já gravado e tenha acesso às instruções.</p><strong>{{ p.completePrice | currency:'BRL' }}</strong><p>{{ p.stock }} em estoque</p>@if (p.stock > 0) { <a class="button primary" [routerLink]="['/finalizar-compra', p.completeProductId]">Comprar dispositivo completo</a> }</section> }</div> }
@if (p.owned) { <app-project-workspace [project]="p" (busyChange)="flashing.set($event)" /> } @else { <p class="notice">O firmware e as instruções serão liberados após o pagamento.</p><button (click)="load()">Atualizar acesso após pagamento</button> }
}
`, styles: `.project-images{display:flex;flex-wrap:wrap;gap:12px}.project-images img{width:220px;max-width:100%;height:180px;object-fit:contain}.project-options{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(280px,100%),1fr));gap:20px}.panel{margin:20px 0}` })
export class StoreProjectPage {
  private api = inject(Api); private route = inject(ActivatedRoute); private id = this.route.snapshot.paramMap.get('id')!;
  project = signal<StoreProject | null>(null); error = signal(''); flashing = signal(false);
  constructor() { this.load(); }
  image(id: string) { return resolveApiUrl('/api/project-store/images/' + id); }
  load() { this.error.set(''); this.api.get<StoreProject>('project-store/' + this.id).subscribe({ next: p => this.project.set(p), error: e => this.error.set(errorMessage(e)) }); }
}
