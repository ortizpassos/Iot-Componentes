import { Component, HostListener, OnDestroy, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Api, Session, errorMessage, resolveApiUrl } from './core';
import { StoreProject, ProjectAsset } from './project-store-model';
import { ConfirmDialog } from './confirm-dialog';
@Component({ imports: [CurrencyPipe, RouterLink], template: `
<p class="eyebrow">PROJETOS PRONTOS</p><h1>Projetos</h1><p class="subtitle">Escolha o projeto digital para gravar sua placa ou receba o dispositivo completo já programado.</p>
@if (error()) { <p class="error" role="alert">{{ error() }} <button (click)="load()">Tentar novamente</button></p> }
@if (loading()) { <p role="status">Carregando projetos...</p> }
<h2 style="margin-top:32px">Projetos disponíveis</h2><div class="product-grid">@for (p of catalog(); track p._id) { <article class="panel">@if (p.images[0]) { <a [routerLink]="['/projetos',p._id]"><img [src]="image(p.images[0])" [alt]="p.name" style="width:100%;height:180px;object-fit:contain"></a> }<h3><a [routerLink]="['/projetos',p._id]">{{ p.name }}</a></h3><p>Projeto digital: {{ p.digitalPrice | currency:'BRL' }}</p>@if (p.completeEnabled) { <p>Dispositivo completo: {{ p.completePrice | currency:'BRL' }}</p> }<a class="button primary" [routerLink]="['/projetos',p._id]">Ver detalhes e opções</a></article> } @empty { @if (!loading()) { <p>Nenhum projeto publicado.</p> } }</div>
` })
export class StoreProjectsPage {
  private api = inject(Api); catalog = signal<StoreProject[]>([]); error = signal(''); loading = signal(false);
  constructor() { this.load(); }
  image(id: string) { return resolveApiUrl('/api/project-store/images/' + id); }
  async load() { this.loading.set(true); this.error.set(''); try { this.catalog.set(await firstValueFrom(this.api.get<StoreProject[]>('project-store'))); } catch (e) { this.error.set(errorMessage(e)); } finally { this.loading.set(false); } }
}
@Component({ imports: [CurrencyPipe, FormsModule, RouterLink, ConfirmDialog], template: `
<a routerLink="/projetos">← Todos os projetos</a> @if (project()?.owned) { <span> · </span><a routerLink="/meu-lab">Meu Lab</a> }
@if (error()) { <p role="alert" class="error">{{ error() }}</p> }
@if (!project() && !error()) { <p role="status">Carregando projeto...</p> }
@if (project(); as p) {
<h1>{{ p.name }}</h1><div class="project-images">@for (id of p.images; track id) { <img [src]="image(id)" [alt]="p.name"> }</div><p class="requirements">{{ p.description }}</p>
@if (p.videoUrl) { <p><a [href]="p.videoUrl" target="_blank" rel="noopener noreferrer">Assistir ao vídeo do projeto</a></p> }
@if (p.active) { <div class="project-options"><section class="panel"><h2>Apenas o projeto</h2><p>Instruções, manuais e gravação na sua placa compatível. Sem envio de dispositivo.</p><strong>{{ p.digitalPrice | currency:'BRL' }}</strong><p><a class="button primary" [routerLink]="['/finalizar-compra', p.digitalProductId]">Comprar projeto digital</a></p></section>
@if (p.completeEnabled) { <section class="panel"><h2>Dispositivo completo</h2><p>Receba o dispositivo já gravado e tenha acesso às instruções.</p><strong>{{ p.completePrice | currency:'BRL' }}</strong><p>{{ p.stock }} em estoque</p>@if (p.stock > 0) { <a class="button primary" [routerLink]="['/finalizar-compra', p.completeProductId]">Comprar dispositivo completo</a> }</section> }</div> }
@if (p.owned) { <section class="panel"><h2>Instruções do meu projeto</h2><p class="requirements">{{ p.instructions || 'Consulte os manuais disponibilizados abaixo.' }}</p>@for (a of p.assets || []; track a._id) { @if (a.kind === 'pdf') { <button [disabled]="flashing()" (click)="download(a)">Baixar {{ a.name }}</button> } }</section>
<section class="panel"><h2>Gravar no meu ESP32</h2><p>Conecte a placa ao computador com um cabo USB de dados. Feche o Monitor Serial e escolha a porta COM na janela do navegador. Se necessário, mantenha BOOT pressionado durante a conexão.</p>
@if (!serialSupported) { <p class="notice">Use Chrome ou Edge em um computador, acessando o site por HTTPS (ou localhost), para gravar pela porta USB.</p> }
<label>Modelo do ESP32<select [(ngModel)]="variant" [disabled]="flashing()"><option value="">Selecione o modelo da sua placa</option>@for (v of p.firmware || []; track $index; let i = $index) { <option [value]="i">{{ v.name }} ({{ v.chip }})</option> }</select></label>
<label><input type="checkbox" [(ngModel)]="manualBoot" [disabled]="flashing()"> Conexão manual com BOOT/EN (se a automática não conectar)</label>
@if (manualBoot) { <p class="notice">Antes de conectar: segure BOOT, pressione e solte EN/RESET e solte BOOT. Depois clique em Conectar e gravar projeto e selecione a porta.</p> }
<p>O firmware substituirá o programa existente e pode alterar configurações da placa. Mantenha o cabo conectado e esta página aberta até terminar.</p>
<button class="primary" [disabled]="!serialSupported || variant === '' || flashing()" (click)="confirming.set(true)">Conectar e gravar projeto</button>
@if (confirming()) { <app-confirm-dialog message="Gravar o projeto na placa selecionada? O programa atual será substituído. Confirme apenas se o modelo e as ligações correspondem às instruções." (confirmed)="flash()" (cancelled)="confirming.set(false)" /> }
@if (flashing()) { <p role="status">{{ stage() }} ({{ progress() }}%)</p><progress [value]="progress()" max="100"></progress> }
@if (success()) { <p class="notice" role="status">{{ success() }}</p> }
@if (log()) { <details open><summary>Registro da gravação</summary><pre>{{ log() }}</pre></details> }
</section> } @else { <p class="notice">O firmware e as instruções serão liberados nesta página após o pagamento.</p><button (click)="load()">Atualizar acesso após pagamento</button> }
}
`, styles: `.project-images{display:flex;flex-wrap:wrap;gap:12px}.project-images img{width:220px;max-width:100%;height:180px;object-fit:contain}.project-options{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(280px,100%),1fr));gap:20px}.panel{margin:20px 0}pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:240px;overflow:auto}select{max-width:100%}` })
export class StoreProjectPage implements OnDestroy {
  private api = inject(Api); private route = inject(ActivatedRoute); private router = inject(Router); private session = inject(Session); private id = this.route.snapshot.paramMap.get('id')!;
  project = signal<StoreProject | null>(null); error = signal(''); confirming = signal(false); flashing = signal(false); progress = signal(0); success = signal(''); log = signal(''); variant = ''; manualBoot = false; stage = signal('');
  serialSupported = window.isSecureContext && 'serial' in navigator; private destroyed = false;
  constructor() { this.load(); }
  ngOnDestroy() { this.destroyed = true; }
  @HostListener('window:beforeunload', ['$event']) beforeUnload(event: BeforeUnloadEvent) { if (this.flashing()) { event.preventDefault(); event.returnValue = ''; } }
  image(id: string) { return resolveApiUrl('/api/project-store/images/' + id); }
  load() { this.error.set(''); this.api.get<StoreProject>('project-store/' + this.id).subscribe({ next: p => this.project.set(p), error: e => this.error.set(errorMessage(e)) }); }
  async download(asset: ProjectAsset) { try { const blob = await firstValueFrom(this.api.download('project-store/' + this.id + '/assets/' + asset._id)); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = asset.name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); } catch(e) { this.error.set(errorMessage(e)); } }
  async flash() {
    this.confirming.set(false); const p = this.project(); const firmware = p?.firmware?.[Number(this.variant)];
    if (!p?.owned || !firmware || this.variant === '' || this.flashing()) return;
    this.flashing.set(true); this.error.set(''); this.success.set(''); this.log.set(''); this.progress.set(0); this.stage.set('Selecione a porta USB na janela do navegador.');
    let port: SerialPort | undefined; let unauthorized = false;
    try {
      // Must remain the first async action: the browser requires the user's click.
      port = await navigator.serial.requestPort();
      this.stage.set('Baixando e verificando os arquivos do projeto...');
      const files: { data: Uint8Array; address: number }[] = [];
      for (const part of firmware.parts) {
        const asset = p.assets?.find(a => a._id === part.assetId);
        if (!asset) throw new Error('Arquivo de firmware indisponível. Atualize a página.');
        const blob = await firstValueFrom(this.api.download('project-store/' + this.id + '/assets/' + part.assetId));
        const buffer = await blob.arrayBuffer(); const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buffer))).map(b => b.toString(16).padStart(2,'0')).join('');
        if (hash !== asset.sha256 || buffer.byteLength !== asset.size) throw new Error('Falha na verificação do firmware. Tente novamente.');
        files.push({ data: new Uint8Array(buffer), address: part.address });
      }
      if (this.destroyed) return;
      this.log.set('Download autenticado e integridade dos arquivos verificados. Iniciando conexão USB...\n');
      const { flashProject } = await import('./project-flasher');
      await flashProject(port, firmware, files, text => this.log.update(v => (v + text + '\n').slice(-12000)), value => this.progress.set(value), () => this.destroyed, this.manualBoot, text => this.stage.set(text));
      this.success.set('Gravação concluída e verificada. Siga as instruções do projeto para configurar e usar o dispositivo.');
    } catch (e) {
      unauthorized = e instanceof HttpErrorResponse && e.status === 401;
      this.error.set(unauthorized ? 'Sua sessão expirou. Entre novamente para gravar o projeto.' : e instanceof HttpErrorResponse && e.status === 403 ? 'O acesso ao firmware não foi liberado para esta conta. Verifique o pagamento do projeto.' : e instanceof HttpErrorResponse ? errorMessage(e) : e instanceof Error ? e.message : 'Não foi possível gravar. Verifique a porta, o cabo e o botão BOOT.');
    }
    finally { try { if (port?.readable) await port.close(); } catch {} this.flashing.set(false);
      // The navigation guard blocks the interceptor redirect while USB is busy.
      // Retry only after releasing the port, including a background request's 401.
      if (unauthorized || !this.session.token()) {
        await this.router.navigate(['/login'], { queryParams: { expired: '1', returnUrl: '/projetos/' + this.id } });
      }
    }
  }
}
