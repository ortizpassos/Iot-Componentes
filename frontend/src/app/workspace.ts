import { Component, inject, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { Api, Device, Project, errorMessage } from './core';

@Component({ imports: [FormsModule], template: `
  <p class="eyebrow">SEU LABORATÓRIO</p><h1>Dispositivos</h1><p class="subtitle">Cadastre as placas que fazem parte dos seus projetos.</p>
  @if (error()) { <p class="error" role="alert">{{ error() }} <button (click)="load()">Atualizar lista</button></p> }
  @if (success()) { <p class="notice" role="status">{{ success() }}</p> }
  <div class="workspace-grid"><section><h2>Minhas placas</h2>@if (loading()) { <p role="status">Carregando dispositivos…</p> } @else { @for (device of devices(); track device._id) { <article class="panel resource"><div class="row"><h3>{{ device.name }}</h3><span class="badge">{{ device.online ? 'Online' : 'Offline' }}</span></div><p class="muted">{{ device.board }} · {{ device.model || 'Modelo não informado' }}</p></article> } @empty { <p class="empty panel">Nenhum dispositivo cadastrado.</p> } }</section>
  <section class="panel"><h2>Novo dispositivo</h2><form #form="ngForm" (ngSubmit)="create(form)"><label>Nome<input name="name" [(ngModel)]="name" required placeholder="ESP32 Sala"></label><label>Placa<input name="board" [(ngModel)]="board" required placeholder="ESP32"></label><label>Modelo<input name="model" [(ngModel)]="model" placeholder="ESP32-S3"></label><label>Número de série<input name="serial" [(ngModel)]="serial" placeholder="IOT-000001"></label><button class="primary" [disabled]="busy() || form.invalid">{{ busy() ? 'Salvando…' : 'Cadastrar dispositivo' }}</button></form></section></div>
` })
export class DevicesPage {
  private api = inject(Api); devices = signal<Device[]>([]); loading = signal(true); busy = signal(false); error = signal(''); success = signal(''); name = ''; board = 'ESP32'; model = ''; serial = '';
  constructor() { this.load(); }
  load() { this.loading.set(true); this.error.set(''); this.api.get<Device[]>('devices').subscribe({ next: data => { this.devices.set(data); this.loading.set(false); }, error: e => { this.error.set(errorMessage(e)); this.loading.set(false); } }); }
  create(form: NgForm) {
    if (form.invalid || this.busy()) return;
    if (!this.name.trim() || !this.board.trim()) { this.error.set('Informe o nome e a placa.'); return; }
    this.busy.set(true); this.error.set(''); this.success.set('');
    this.api.post<Device>('devices', { name: this.name.trim(), board: this.board.trim(), ...(this.model.trim() ? { model: this.model.trim() } : {}), ...(this.serial.trim() ? { serialNumber: this.serial.trim() } : {}) }).subscribe({ next: device => { this.devices.update(data => [...data, device]); this.busy.set(false); this.success.set('Dispositivo cadastrado.'); form.resetForm({ board: 'ESP32' }); this.name = ''; this.board = 'ESP32'; this.model = ''; this.serial = ''; }, error: e => { this.error.set(errorMessage(e)); this.busy.set(false); } });
  }
}

@Component({ imports: [FormsModule], template: `
  <p class="eyebrow">DA IDEIA À PRÁTICA</p><h1>Projetos</h1><p class="subtitle">Organize o que você quer construir.</p>
  @if (error()) { <p class="error" role="alert">{{ error() }} <button (click)="load()">Atualizar lista</button></p> }
  @if (deviceError()) { <p class="notice">Não foi possível carregar os dispositivos. Você pode criar um projeto sem vínculo. <button (click)="loadDevices()">Tentar novamente</button></p> }
  @if (success()) { <p class="notice" role="status">{{ success() }}</p> }
  <div class="workspace-grid"><section><h2>Meus projetos</h2>@if (loading()) { <p role="status">Carregando projetos…</p> } @else { @for (project of projects(); track project._id) { <article class="panel resource"><div class="row"><h3>{{ project.name }}</h3><span class="badge">{{ status(project.status) }}</span></div><p class="requirements">{{ project.description || 'Sem descrição.' }}</p><small class="muted">{{ project.device?.name || 'Sem dispositivo vinculado' }}</small></article> } @empty { <p class="empty panel">Seu primeiro projeto começa aqui.</p> } }</section>
  <section class="panel"><h2>Novo projeto</h2><form #form="ngForm" (ngSubmit)="create(form)"><label>Nome<input name="name" [(ngModel)]="name" required placeholder="Iluminação automática"></label><label>Descrição<textarea name="description" [(ngModel)]="description" placeholder="O que você pretende criar?"></textarea></label><label>Dispositivo<select name="deviceId" [(ngModel)]="deviceId"><option value="">Vincular depois</option>@for (device of devices(); track device._id) { <option [value]="device._id">{{ device.name }}</option> }</select></label><button class="primary" [disabled]="busy() || form.invalid">{{ busy() ? 'Salvando…' : 'Criar projeto' }}</button></form></section></div>
` })
export class ProjectsPage {
  private api = inject(Api); projects = signal<Project[]>([]); devices = signal<Device[]>([]); loading = signal(true); busy = signal(false); error = signal(''); deviceError = signal(false); success = signal(''); name = ''; description = ''; deviceId = '';
  status(value: string) { return ({ DRAFT: 'Rascunho', READY: 'Pronto', ARCHIVED: 'Arquivado' } as Record<string, string>)[value] || value; }
  constructor() { this.load(); this.loadDevices(); }
  loadDevices() { this.deviceError.set(false); this.api.get<Device[]>('devices').subscribe({ next: data => this.devices.set(data), error: () => this.deviceError.set(true) }); }
  load() { this.loading.set(true); this.error.set(''); this.api.get<Project[]>('projects').subscribe({ next: data => { this.projects.set(data); this.loading.set(false); }, error: e => { this.error.set(errorMessage(e)); this.loading.set(false); } }); }
  create(form: NgForm) {
    if (form.invalid || this.busy()) return;
    if (!this.name.trim()) { this.error.set('Informe o nome do projeto.'); return; }
    this.busy.set(true); this.error.set(''); this.success.set('');
    const selected = this.devices().find(d => d._id === this.deviceId);
    this.api.post<Project>('projects', { name: this.name.trim(), description: this.description.trim(), source: 'MANUAL', ...(this.deviceId ? { deviceId: this.deviceId } : {}) }).subscribe({ next: project => { this.projects.update(data => [...data, { ...project, device: selected }]); this.busy.set(false); this.success.set('Projeto criado.'); form.resetForm({ deviceId: '' }); this.name = ''; this.description = ''; this.deviceId = ''; }, error: e => { this.error.set(errorMessage(e)); this.busy.set(false); } });
  }
}
