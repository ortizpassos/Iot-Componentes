import { Component, inject, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { Api, errorMessage } from './core';
export interface Packaging { _id: string; name: string; lengthCm: number; widthCm: number; heightCm: number }
@Component({
  selector: 'app-admin-packages', imports: [FormsModule], styleUrl: './admin.css',
  template: `
    <section class="panel"><h2>Embalagens</h2><p>Cadastre as medidas externas das embalagens usadas no envio. Alterar uma embalagem atualiza as próximas cotações dos produtos que a utilizam.</p>
    @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
    @if (notice()) { <p role="status">{{ notice() }}</p> }
    <h3>{{ editingId ? 'Editar embalagem' : 'Nova embalagem' }}</h3>
    <form #packageForm="ngForm" (ngSubmit)="save(packageForm)"><fieldset [disabled]="busy()"><div class="form-grid">
      <label>Nome da embalagem<input name="packageName" [(ngModel)]="form.name" required maxlength="100" placeholder="Ex.: Caixa pequena"></label>
      <label>Comprimento (cm)<input name="length" type="number" [(ngModel)]="form.lengthCm" required min="1" max="200" step="any"></label>
      <label>Largura (cm)<input name="width" type="number" [(ngModel)]="form.widthCm" required min="1" max="200" step="any"></label>
      <label>Altura (cm)<input name="height" type="number" [(ngModel)]="form.heightCm" required min="1" max="200" step="any"></label>
    </div><button class="primary" [disabled]="packageForm.invalid || !form.name.trim() || busy()">{{ busy() ? 'Salvando...' : 'Salvar embalagem' }}</button>
    @if (editingId) { <button type="button" (click)="reset()">Cancelar</button> }
    </fieldset></form></section>
    @if (loading()) { <p role="status">Carregando embalagens...</p> }
    <button [disabled]="loading() || busy()" (click)="load()">Atualizar embalagens</button>
    @for (item of items(); track item._id) { <section class="panel"><h3>{{ item.name }}</h3><p>{{ item.lengthCm }} × {{ item.widthCm }} × {{ item.heightCm }} cm (comprimento × largura × altura)</p><button [disabled]="busy()" (click)="edit(item)">Editar embalagem</button></section> }
    @if (!loading() && !items().length) { <p>Nenhuma embalagem cadastrada.</p> }
  `,
})
export class AdminPackages {
  private api = inject(Api);
  items = signal<Packaging[]>([]); loading = signal(false); busy = signal(false); error = signal(''); notice = signal('');
  editingId = ''; form = { name: '', lengthCm: 15, widthCm: 10, heightCm: 5 };
  constructor() { this.load(); }
  reset() { this.editingId = ''; this.form = { name: '', lengthCm: 15, widthCm: 10, heightCm: 5 }; }
  edit(item: Packaging) { this.editingId = item._id; this.form = { name: item.name, lengthCm: item.lengthCm, widthCm: item.widthCm, heightCm: item.heightCm }; this.notice.set(''); }
  load() {
    this.loading.set(true); this.error.set('');
    this.api.get<Packaging[]>('admin/packages').subscribe({ next: items => { this.items.set(items); this.loading.set(false); }, error: e => { this.error.set(errorMessage(e)); this.loading.set(false); } });
  }
  save(form: NgForm) {
    if (form.invalid || this.busy() || !this.form.name.trim()) return;
    this.busy.set(true); this.error.set(''); this.notice.set('');
    const body = { ...this.form, name: this.form.name.trim() };
    const request = this.editingId ? this.api.put('admin/packages/' + this.editingId, body) : this.api.post('admin/packages', body);
    request.subscribe({ next: () => { this.busy.set(false); this.reset(); this.notice.set('Embalagem salva.'); this.load(); }, error: e => { this.busy.set(false); this.error.set(errorMessage(e)); } });
  }
}
