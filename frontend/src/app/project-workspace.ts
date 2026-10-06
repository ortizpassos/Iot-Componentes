import { Component, HostListener, OnDestroy, inject, input, output, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Api, Session, errorMessage } from './core';
import { StoreProject, ProjectAsset } from './project-store-model';
import { ConfirmDialog } from './confirm-dialog';
@Component({ selector: 'app-project-workspace', imports: [FormsModule, ConfirmDialog], template: `
@if (error()) { <p role="alert" class="error">{{ error() }}</p> }
@if (project(); as p) { <section class="panel"><h2>Código do projeto</h2>@if (p.instructions) { <pre class="project-code"><code>{{ p.instructions }}</code></pre> } @else { <p class="requirements">Este projeto não possui código-fonte cadastrado. Consulte os manuais disponibilizados abaixo.</p> }@for (a of p.assets || []; track a._id) { @if (a.kind === 'pdf') { <button [disabled]="flashing()" (click)="download(a)">Baixar {{ a.name }}</button> } }</section>
<section class="panel"><h2>Gravar no meu ESP32</h2><p>Conecte a placa ao computador com um cabo USB de dados. Feche o Monitor Serial e escolha a porta COM na janela do navegador. Se necessário, mantenha BOOT pressionado durante a conexão.</p>
@if (!serialSupported) { <p class="notice">Use Chrome ou Edge em um computador, acessando o site por HTTPS (ou localhost), para gravar pela porta USB.</p> }
@if ((p.firmware?.length || 0) > 1) { <label>Versão do firmware<select [(ngModel)]="variant" [disabled]="flashing()"><option value="">Selecione a versão</option>@for (v of firmwareOptions(); track v.index) { <option [value]="v.index">{{ v.name }} — placa {{ v.chip }}</option> }</select></label> }
@if (selectedFirmware(); as firmware) { <div class="notice"><p><strong>Placa necessária:</strong> {{ firmware.chip }}<br><span>{{ firmware.name }}</span></p>@if (firmware.description) { <p><strong>Descrição da versão:</strong> {{ firmware.description }}</p> }</div> }
<p class="muted">O modelo foi identificado pelo arquivo de firmware enviado pelo administrador. Confira essa identificação na placa antes de conectar.</p>
<label><input type="checkbox" [(ngModel)]="manualBoot" [disabled]="flashing()"> Conexão manual com BOOT/EN (se a automática não conectar)</label>
@if (manualBoot) { <p class="notice">Antes de conectar: segure BOOT, pressione e solte EN/RESET e solte BOOT. Depois clique em Conectar e gravar projeto e selecione a porta.</p> }
<p>O firmware substituirá o programa existente e pode alterar configurações da placa. Mantenha o cabo conectado e esta página aberta até terminar.</p>
<button class="primary" [disabled]="!serialSupported || !selectedFirmware() || flashing()" (click)="confirming.set(true)">Conectar e gravar projeto</button>
@if (confirming()) { <app-confirm-dialog [message]="'Gravar o projeto em uma placa ' + selectedFirmware()?.chip + '? O programa atual será substituído. Confirme se o modelo corresponde ao indicado.'" (confirmed)="flash()" (cancelled)="confirming.set(false)" /> }
@if (flashing()) { <p role="status">{{ stage() }} ({{ progress() }}%)</p><progress [value]="progress()" max="100"></progress> }
@if (success()) { <p class="notice" role="status">{{ success() }}</p> }
@if (log()) { <details open><summary>Registro da gravação</summary><pre>{{ log() }}</pre></details> }
</section> }
`, styles: `.panel{margin:20px 0}.project-code{white-space:pre;overflow:auto;max-height:420px;padding:16px;border:1px solid var(--border);border-radius:8px;background:#101820;color:#e7f0f7;tab-size:2}select{max-width:100%}` })
export class ProjectWorkspace implements OnDestroy {
  private api = inject(Api); private router = inject(Router); private session = inject(Session);
  project = input.required<StoreProject>(); busyChange = output<boolean>(); error = signal(''); confirming = signal(false); flashing = signal(false); progress = signal(0); success = signal(''); log = signal(''); variant = ''; manualBoot = false; stage = signal('');
  serialSupported = window.isSecureContext && 'serial' in navigator; private destroyed = false;
  firmwareOptions() { return (this.project()?.firmware || []).map((v, index) => ({ ...v, index })); }
  selectedFirmware() { const options = this.project()?.firmware || []; return options.length === 1 ? options[0] : this.variant === '' ? undefined : options[Number(this.variant)]; }
  ngOnDestroy() { this.destroyed = true; }
  @HostListener('window:beforeunload', ['$event']) beforeUnload(event: BeforeUnloadEvent) { if (this.flashing()) { event.preventDefault(); event.returnValue = ''; } }
  async download(asset: ProjectAsset) { try { const blob = await firstValueFrom(this.api.download('project-store/' + this.project()._id + '/assets/' + asset._id)); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = asset.name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); } catch(e) { this.error.set(errorMessage(e)); } }
  async flash() {
    this.confirming.set(false); const p = this.project(); const firmware = this.selectedFirmware();
    if (!p?.owned || !firmware || this.flashing()) return;
    this.flashing.set(true); this.busyChange.emit(true); this.error.set(''); this.success.set(''); this.log.set(''); this.progress.set(0); this.stage.set('Selecione a porta USB na janela do navegador.');
    let port: SerialPort | undefined; let unauthorized = false;
    try {
      // Must remain the first async action: the browser requires the user's click.
      port = await navigator.serial.requestPort();
      this.stage.set('Baixando e verificando os arquivos do projeto...');
      const files: { data: Uint8Array; address: number }[] = [];
      for (const part of firmware.parts) {
        const asset = p.assets?.find(a => a._id === part.assetId);
        if (!asset) throw new Error('Arquivo de firmware indisponível. Atualize a página.');
        const blob = await firstValueFrom(this.api.download('project-store/' + this.project()._id + '/assets/' + part.assetId));
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
    finally { try { if (port?.readable) await port.close(); } catch {} this.flashing.set(false); this.busyChange.emit(false);
      // The navigation guard blocks the interceptor redirect while USB is busy.
      // Retry only after releasing the port, including a background request's 401.
      if (unauthorized || !this.session.token()) {
        await this.router.navigate(['/login'], { queryParams: { expired: '1', returnUrl: this.router.url } });
      }
    }
  }
}
