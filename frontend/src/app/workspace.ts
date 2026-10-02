import { Component, inject, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { Api, Device, errorMessage } from './core';

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
