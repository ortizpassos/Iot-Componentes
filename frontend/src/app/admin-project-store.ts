import { ConfirmDialog } from './confirm-dialog';
import { Component, inject, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { FormsModule, NgForm } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Api, errorMessage, resolveApiUrl } from './core';
import { StoreProject, ProjectAsset, ProjectFirmware } from './project-store-model';
function initialFirmware(version = 1): ProjectFirmware { return { name: 'Versão ' + version, description: '', chip: '', format: 'MERGED', parts: [{ assetId: '', address: 0 }] }; }
function empty() { return { name: '', description: '', instructions: '', active: false, isFree: false, digitalPrice: 1, completeEnabled: false, completePrice: 0, stock: 0, packagingId: '', weightGrams: 1, images: [] as string[], pdfs: [] as string[], videoUrl: '', firmware: [initialFirmware()] }; }
@Component({ selector: 'app-admin-project-store', imports: [FormsModule, CurrencyPipe, RouterLink, ConfirmDialog], styleUrl: './admin.css', template: `
<section class="panel"><h2>Projetos grátis e pagos</h2><p>Projetos grátis publicados aparecem automaticamente no Meu Lab dos clientes. Nos projetos pagos, as instruções, PDFs e firmware são liberados após pagamento. Você também pode vender o dispositivo completo já gravado.</p><button [disabled]="busy()" (click)="start()">Cadastrar projeto</button><button [disabled]="busy()" (click)="load()">Atualizar projetos</button></section>
@if (error()) { <p class="error" role="alert">{{ error() }}</p> } @if (notice()) { <p role="status">{{ notice() }}</p> }
@if (editing()) { <div class="admin-project-modal" role="dialog" aria-modal="true" aria-labelledby="project-editor-title"><section class="panel admin-project-modal__content"><div class="admin-project-modal__header"><h2 id="project-editor-title">{{ editingId ? 'Editar projeto' : 'Novo projeto' }}</h2><button type="button" aria-label="Fechar cadastro de projeto" [disabled]="busy()" (click)="editing.set(false)">Fechar</button></div><form #f="ngForm" (ngSubmit)="save(f)"><fieldset [disabled]="busy()"><div class="form-grid">
<label>Nome do projeto<input name="name" [(ngModel)]="form.name" required maxlength="150"></label>
<label class="wide">Descrição do anúncio<textarea name="description" [(ngModel)]="form.description" required maxlength="20000"></textarea></label>
<label class="wide">Código do projeto<textarea class="project-code-editor" name="instructions" [(ngModel)]="form.instructions" rows="14" maxlength="50000" spellcheck="false" placeholder="Cole aqui o código-fonte que será liberado ao cliente"></textarea></label>
<p class="wide muted">Projetos pagos liberam este código após a confirmação do pagamento. Projetos grátis liberam o código junto com a gravação no Meu Lab.</p>
<label>Categoria do projeto<select name="isFree" [(ngModel)]="form.isFree"><option [ngValue]="false">Pago</option><option [ngValue]="true">Grátis</option></select></label>
@if (form.isFree) { <p>O projeto digital será gratuito e estará disponível no Meu Lab assim que for publicado.</p> }
@else { <label>Preço apenas do projeto (R$)<input name="digitalPrice" type="number" [(ngModel)]="form.digitalPrice" required min="0.01" step="0.01"></label> }
<label>Link do vídeo (opcional)<input name="videoUrl" type="url" [(ngModel)]="form.videoUrl" pattern="https?://.+"></label>
<label class="check"><input name="completeEnabled" type="checkbox" [(ngModel)]="form.completeEnabled">Oferecer dispositivo completo gravado</label>
@if (form.completeEnabled) {
@if (form.isFree) { <p class="wide">A gratuidade se aplica ao projeto digital. O dispositivo completo é vendido pelo preço abaixo, com frete.</p> }
<label>Preço completo (R$)<input name="completePrice" type="number" [(ngModel)]="form.completePrice" required min="0.01" step="0.01"></label>
<label>Estoque de dispositivos<input name="stock" type="number" [(ngModel)]="form.stock" required min="0" step="1"></label>
<label>Peso do dispositivo (g)<input name="weight" type="number" [(ngModel)]="form.weightGrams" required min="1" step="1"></label>
}
<section class="wide"><h3>Imagens (até 5)</h3><input aria-label="Enviar imagem do projeto" type="file" accept="image/png,image/jpeg,image/webp" [disabled]="form.images.length >= 5" (change)="upload($event, 'image')">@for (id of form.images; track id; let i = $index) { <div><img [src]="image(id)" alt="Imagem do projeto" style="width:140px;max-width:100%;height:100px;object-fit:contain"><button type="button" (click)="form.images.splice(i,1)">Remover imagem {{ i + 1 }}</button></div> }</section>
<section class="wide"><h3>Manuais PDF (até 10)</h3><input aria-label="Enviar manual PDF" type="file" accept="application/pdf,.pdf" [disabled]="form.pdfs.length >= 10" (change)="upload($event, 'pdf')">@for (id of form.pdfs; track id; let i = $index) { <p>Manual {{ i + 1 }} <button type="button" (click)="form.pdfs.splice(i,1)">Remover PDF</button></p> }</section>
<section class="wide"><h3>Versões do firmware</h3><p>Envie um BIN completo (merged). A placa e o endereço de gravação serão definidos automaticamente. Ao atualizar, a versão anterior continuará disponível para os clientes.</p>
@for (v of form.firmware; track $index; let i = $index) { <fieldset class="panel"><legend>{{ v.name || ('Versão ' + (i + 1)) }}</legend><div class="form-grid">
<p><strong>Placa detectada:</strong> {{ v.chip || 'envie o arquivo .bin para identificar' }}</p>
<label class="wide">Descrição da versão<textarea [name]="'firmwareDescription' + i" [(ngModel)]="v.description" maxlength="1000" rows="3" placeholder="Ex.: melhora a conexão Wi-Fi e corrige a leitura do sensor"></textarea></label></div>
@if (v.parts[0]?.assetId) { <p><strong>Arquivo preservado.</strong> Para enviar outro BIN, use Atualizar firmware.</p> }
@else { <label>Arquivo .bin<input type="file" accept=".bin" (change)="upload($event, 'bin', i, 0)"></label><p>Selecione o BIN completo desta versão.</p> }
</fieldset> }
<button type="button" [disabled]="form.firmware.length >= 10 || hasPendingFirmware()" (click)="addFirmwareVersion()">Atualizar firmware</button>
</section>
<label class="check"><input name="active" type="checkbox" [(ngModel)]="form.active">Publicado no catálogo de projetos</label>
</div><button class="primary" [disabled]="f.invalid || busy()">{{ busy() ? 'Salvando...' : 'Salvar projeto' }}</button><button type="button" (click)="editing.set(false)">Cancelar</button></fieldset></form></section></div> }
@for (p of projects(); track p._id) { <section class="panel"><h3>{{ p.name }}</h3><p><strong>{{ p.isFree ? 'Grátis' : 'Pago' }}</strong> · {{ p.active ? 'Publicado' : 'Rascunho / desativado' }} @if (!p.isFree) { · Digital: {{ p.digitalPrice | currency:'BRL' }} } @if (p.completeEnabled) { · Completo: {{ p.completePrice | currency:'BRL' }} }</p><div class="row"><button [disabled]="busy()" (click)="start(p)">Editar projeto</button><a class="button" [routerLink]="['/projetos', p._id]">Visualizar projeto</a><button [disabled]="busy()" (click)="deleting.set(p); deleteError.set('')">Excluir projeto</button></div></section> }
@if (deleting(); as p) { <app-confirm-dialog [message]="'Excluir o projeto ' + p.name + '? Ele sairá do cadastro e do catálogo. Quem já comprou continuará com acesso aos arquivos e instruções.'" [destructive]="true" [busy]="busy()" [error]="deleteError()" (confirmed)="remove()" (cancelled)="deleting.set(null)" /> }
` })
export class AdminProjectStore {
  private api = inject(Api); projects = signal<StoreProject[]>([]); busy = signal(false); error = signal(''); notice = signal(''); editing = signal(false); editingId = ''; form = empty();
  deleting = signal<StoreProject | null>(null); deleteError = signal('');
  remove() {
    const project = this.deleting(); if (!project || this.busy()) return;
    this.busy.set(true); this.deleteError.set(''); this.notice.set('');
    this.api.delete('admin/project-store/' + project._id).subscribe({
      next: () => { this.busy.set(false); this.deleting.set(null); if (this.editingId === project._id) this.editing.set(false); this.projects.update(items => items.filter(p => p._id !== project._id)); this.notice.set('Projeto excluído.'); },
      error: e => { this.busy.set(false); this.deleteError.set(errorMessage(e)); },
    });
  }
  constructor() { this.load(); }
  image(id: string) { return resolveApiUrl('/api/project-store/images/' + id); }
  load() { this.api.get<StoreProject[]>('admin/project-store').subscribe({ next: p => this.projects.set(p), error: e => this.error.set(errorMessage(e)) }); }
  start(p?: StoreProject) { this.form = p ? { ...empty(), name: p.name, description: p.description, instructions: p.instructions || '', active: p.active, isFree: p.isFree === true, digitalPrice: p.digitalPrice, completeEnabled: p.completeEnabled, completePrice: p.completePrice, stock: p.stock, packagingId: p.packagingId || '', weightGrams: p.weightGrams || 1, images: [...p.images], pdfs: [...(p.pdfs || [])], videoUrl: p.videoUrl || '', firmware: p.firmware?.length ? structuredClone(p.firmware).map((v, i) => ({ ...v, name: `Versão ${i + 1}`, description: v.description || '' })) : [initialFirmware()] } : empty(); this.editingId = p?._id || ''; this.editing.set(true); this.error.set(''); this.notice.set(''); }
  hasPendingFirmware() { return this.form.firmware.some(v => !v.parts[0]?.assetId); }
  addFirmwareVersion() { if (!this.hasPendingFirmware() && this.form.firmware.length < 10) this.form.firmware.push(initialFirmware(this.form.firmware.length + 1)); }
  upload(event: Event, kind: string, i = -1, j = -1) {
    const input = event.target as HTMLInputElement; const file = input.files?.[0]; input.value = ''; if (!file || this.busy()) return;
    this.busy.set(true); this.error.set(''); const body = new FormData(); body.append('file', file);
    this.api.post<ProjectAsset>('admin/project-store/assets/' + kind, body).subscribe({ next: asset => { if (kind === 'image') this.form.images.push(asset._id); else if (kind === 'pdf') this.form.pdfs.push(asset._id); else { const version = this.form.firmware[i]; version.parts = [{ assetId: asset._id, address: 0 }]; version.format = 'MERGED'; if (asset.detectedChip) version.chip = asset.detectedChip; } this.busy.set(false); }, error: e => { this.error.set(errorMessage(e)); this.busy.set(false); } });
  }
  save(f: NgForm) {
    if (f.invalid || this.busy()) return;
    if (this.form.firmware.some(v => !v.parts.length || v.parts.some(p => !p.assetId))) { this.error.set('Envie todos os arquivos de firmware.'); return; }
    const { packagingId, weightGrams, videoUrl, ...fields } = this.form;
    const body = { ...fields, digitalPrice: fields.isFree ? 0 : fields.digitalPrice, ...(fields.completeEnabled ? { weightGrams } : {}), ...(videoUrl ? { videoUrl } : {}) };
    this.busy.set(true); this.error.set('');
    const req = this.editingId ? this.api.put('admin/project-store/' + this.editingId, body) : this.api.post('admin/project-store', body);
    req.subscribe({ next: () => { this.busy.set(false); this.editing.set(false); this.notice.set('Projeto salvo.'); this.load(); }, error: e => { this.busy.set(false); this.error.set(errorMessage(e)); } });
  }
}
