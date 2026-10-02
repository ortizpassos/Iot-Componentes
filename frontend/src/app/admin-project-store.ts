import { Component, inject, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { FormsModule, NgForm } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Api, errorMessage, resolveApiUrl } from './core';
import { Packaging } from './admin-packages';
import { StoreProject, ProjectAsset, ProjectFirmware, ESP_CHIPS } from './project-store-model';
function empty() { return { name: '', description: '', instructions: '', active: false, digitalPrice: 1, completeEnabled: false, completePrice: 0, stock: 0, packagingId: '', weightGrams: 1, images: [] as string[], pdfs: [] as string[], videoUrl: '', firmware: [] as ProjectFirmware[] }; }
@Component({ selector: 'app-admin-project-store', imports: [FormsModule, CurrencyPipe, RouterLink], styleUrl: './admin.css', template: `
<section class="panel"><h2>Projetos prontos para venda</h2><p>Cadastre a compra digital e, opcionalmente, o dispositivo completo já gravado. As instruções, PDFs e firmware são liberados após pagamento.</p><button [disabled]="busy()" (click)="start()">Cadastrar projeto</button><button [disabled]="busy()" (click)="load()">Atualizar projetos</button></section>
@if (error()) { <p class="error" role="alert">{{ error() }}</p> } @if (notice()) { <p role="status">{{ notice() }}</p> }
@if (editing()) { <section class="panel"><h2>{{ editingId ? 'Editar projeto' : 'Novo projeto' }}</h2><form #f="ngForm" (ngSubmit)="save(f)"><fieldset [disabled]="busy()"><div class="form-grid">
<label>Nome do projeto<input name="name" [(ngModel)]="form.name" required maxlength="150"></label>
<label class="wide">Descrição do anúncio<textarea name="description" [(ngModel)]="form.description" required maxlength="20000"></textarea></label>
<label class="wide">Instruções para o comprador<textarea name="instructions" [(ngModel)]="form.instructions" rows="8" maxlength="50000" placeholder="Montagem, ligações, configuração, uso e cuidados com o dispositivo"></textarea></label>
<label>Preço apenas do projeto (R$)<input name="digitalPrice" type="number" [(ngModel)]="form.digitalPrice" required min="0.01" step="0.01"></label>
<label>Link do vídeo (opcional)<input name="videoUrl" type="url" [(ngModel)]="form.videoUrl" pattern="https?://.+"></label>
<label class="check"><input name="completeEnabled" type="checkbox" [(ngModel)]="form.completeEnabled">Oferecer dispositivo completo gravado</label>
@if (form.completeEnabled) {
<label>Preço completo (R$)<input name="completePrice" type="number" [(ngModel)]="form.completePrice" required min="0.01" step="0.01"></label>
<label>Estoque de dispositivos<input name="stock" type="number" [(ngModel)]="form.stock" required min="0" step="1"></label>
<label>Embalagem<select name="packaging" [(ngModel)]="form.packagingId" required><option value="">Selecione</option>@for (p of packages(); track p._id) { <option [value]="p._id">{{ p.name }}</option> }</select></label>
<label>Peso do dispositivo (g)<input name="weight" type="number" [(ngModel)]="form.weightGrams" required min="1" step="1"></label>
}
<section class="wide"><h3>Imagens (até 5)</h3><input aria-label="Enviar imagem do projeto" type="file" accept="image/png,image/jpeg,image/webp" [disabled]="form.images.length >= 5" (change)="upload($event, 'image')">@for (id of form.images; track id; let i = $index) { <div><img [src]="image(id)" alt="Imagem do projeto" style="width:140px;max-width:100%;height:100px;object-fit:contain"><button type="button" (click)="form.images.splice(i,1)">Remover imagem {{ i + 1 }}</button></div> }</section>
<section class="wide"><h3>Manuais PDF (até 10)</h3><input aria-label="Enviar manual PDF" type="file" accept="application/pdf,.pdf" [disabled]="form.pdfs.length >= 10" (change)="upload($event, 'pdf')">@for (id of form.pdfs; track id; let i = $index) { <p>Manual {{ i + 1 }} <button type="button" (click)="form.pdfs.splice(i,1)">Remover PDF</button></p> }</section>
<section class="wide"><h3>Firmware por modelo de ESP32</h3><p>Use um BIN completo (merged) no endereço 0, ou informe todos os arquivos e endereços da compilação. Um BIN apenas do programa não prepara uma placa nova. Arquivos: até 10 MB cada.</p>
@for (v of form.firmware; track $index; let i = $index) { <fieldset class="panel"><legend>Firmware {{ i + 1 }}</legend><div class="form-grid">
<label>Modelo da placa<input [name]="'variantName' + i" [(ngModel)]="v.name" required placeholder="Ex.: ESP32 DevKit V1 4 MB"></label>
<label>Família do chip<select [name]="'chip' + i" [(ngModel)]="v.chip">@for (chip of chips; track chip) { <option [value]="chip">{{ chip }}</option> }</select></label>
<label>Formato<select [name]="'format' + i" [(ngModel)]="v.format"><option value="MERGED">BIN completo (merged), endereço 0</option><option value="PARTS">Arquivos separados com endereços</option></select></label></div>
@for (part of v.parts; track $index; let j = $index) { <div class="panel"><label>Arquivo .bin {{ j + 1 }}<input type="file" accept=".bin" (change)="upload($event, 'bin', i, j)"></label><p>{{ part.assetId ? 'Arquivo enviado' : 'Selecione o BIN' }}</p><label>Endereço na flash (decimal)<input type="number" [name]="'address' + i + '-' + j" [(ngModel)]="part.address" min="0" step="4096" required [readonly]="v.format === 'MERGED'"></label><small>Exemplos: 0x1000 = 4096; 0x8000 = 32768; 0x10000 = 65536.</small>@if (v.format === 'PARTS') { <button type="button" (click)="v.parts.splice(j,1)">Remover arquivo</button> }</div> }
@if (v.format === 'PARTS') { <button type="button" [disabled]="v.parts.length >= 8" (click)="v.parts.push({ assetId: '', address: 0 })">Adicionar BIN</button> }
<button type="button" (click)="form.firmware.splice(i,1)">Remover firmware</button></fieldset> }
<button type="button" [disabled]="form.firmware.length >= 10" (click)="addFirmware()">Adicionar modelo ESP32</button></section>
<label class="check"><input name="active" type="checkbox" [(ngModel)]="form.active">Publicado no catálogo de projetos</label>
</div><button class="primary" [disabled]="f.invalid || busy()">{{ busy() ? 'Salvando...' : 'Salvar projeto' }}</button><button type="button" (click)="editing.set(false)">Fechar</button></fieldset></form></section> }
@for (p of projects(); track p._id) { <section class="panel"><h3>{{ p.name }}</h3><p>{{ p.active ? 'Publicado' : 'Rascunho / desativado' }} · Digital: {{ p.digitalPrice | currency:'BRL' }} @if (p.completeEnabled) { · Completo: {{ p.completePrice | currency:'BRL' }} }</p><button [disabled]="busy()" (click)="start(p)">Editar projeto</button><a [routerLink]="['/projetos', p._id]">Visualizar projeto</a></section> }
` })
export class AdminProjectStore {
  private api = inject(Api); projects = signal<StoreProject[]>([]); packages = signal<Packaging[]>([]); busy = signal(false); error = signal(''); notice = signal(''); editing = signal(false); editingId = ''; form = empty(); chips = ESP_CHIPS;
  constructor() { this.load(); this.api.get<Packaging[]>('admin/packages').subscribe({ next: p => this.packages.set(p), error: e => this.error.set(errorMessage(e)) }); }
  image(id: string) { return resolveApiUrl('/api/project-store/images/' + id); }
  load() { this.api.get<StoreProject[]>('admin/project-store').subscribe({ next: p => this.projects.set(p), error: e => this.error.set(errorMessage(e)) }); }
  start(p?: StoreProject) { this.form = p ? { ...empty(), name: p.name, description: p.description, instructions: p.instructions || '', active: p.active, digitalPrice: p.digitalPrice, completeEnabled: p.completeEnabled, completePrice: p.completePrice, stock: p.stock, packagingId: p.packagingId || '', weightGrams: p.weightGrams || 1, images: [...p.images], pdfs: [...(p.pdfs || [])], videoUrl: p.videoUrl || '', firmware: structuredClone(p.firmware || []) } : empty(); this.editingId = p?._id || ''; this.editing.set(true); this.error.set(''); this.notice.set(''); }
  addFirmware() { this.form.firmware.push({ name: '', chip: 'ESP32', format: 'MERGED', parts: [{ assetId: '', address: 0 }] }); }
  upload(event: Event, kind: string, i = -1, j = -1) {
    const input = event.target as HTMLInputElement; const file = input.files?.[0]; input.value = ''; if (!file || this.busy()) return;
    this.busy.set(true); this.error.set(''); const body = new FormData(); body.append('file', file);
    this.api.post<ProjectAsset>('admin/project-store/assets/' + kind, body).subscribe({ next: asset => { if (kind === 'image') this.form.images.push(asset._id); else if (kind === 'pdf') this.form.pdfs.push(asset._id); else this.form.firmware[i].parts[j].assetId = asset._id; this.busy.set(false); }, error: e => { this.error.set(errorMessage(e)); this.busy.set(false); } });
  }
  save(f: NgForm) {
    if (f.invalid || this.busy()) return;
    if (this.form.firmware.some(v => !v.parts.length || v.parts.some(p => !p.assetId))) { this.error.set('Envie todos os arquivos de firmware.'); return; }
    const { packagingId, weightGrams, videoUrl, ...fields } = this.form;
    const body = { ...fields, ...(fields.completeEnabled ? { packagingId, weightGrams } : {}), ...(videoUrl ? { videoUrl } : {}) };
    this.busy.set(true); this.error.set('');
    const req = this.editingId ? this.api.put('admin/project-store/' + this.editingId, body) : this.api.post('admin/project-store', body);
    req.subscribe({ next: () => { this.busy.set(false); this.editing.set(false); this.notice.set('Projeto salvo.'); this.load(); }, error: e => { this.busy.set(false); this.error.set(errorMessage(e)); } });
  }
}
