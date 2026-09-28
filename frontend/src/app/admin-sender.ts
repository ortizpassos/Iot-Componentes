import { Component, DestroyRef, inject, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Api, errorMessage } from './core';
import { CheckoutProfile } from './checkout-profile';
import { StoreConfig } from './store-config';
type Sender = Pick<CheckoutProfile, 'fullName' | 'address'>;

@Component({ selector: 'app-admin-sender', imports: [FormsModule], template: `
  <section class="panel sender"><h2>Remetente das etiquetas</h2>
    <p class="muted">Cadastre o nome e o endereço de origem da loja. Estes dados serão impressos no quadro REMETENTE das novas etiquetas. Etiquetas já emitidas mantêm os dados usados no envio.</p>
    @if (loading()) { <p role="status">Carregando remetente…</p> }
    @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
    @if (saved()) { <p class="notice" role="status">Dados do remetente salvos.</p> }
    @if (!loading() && !loaded()) { <button (click)="load()">Tentar carregar remetente novamente</button> }
    @if (loaded()) {
      <form #form="ngForm" (ngSubmit)="save(form)"><fieldset [disabled]="busy()">
        <label>Nome da loja / remetente<input name="senderName" [(ngModel)]="value.fullName" required maxlength="150"></label>
        <div class="fields">
          <label>CEP do remetente<input name="senderZipCode" [(ngModel)]="value.address.zipCode" required pattern="[0-9]{5}-?[0-9]{3}" maxlength="9" inputmode="numeric" placeholder="00000-000"></label>
          <label>Rua / Avenida do remetente<input name="senderStreet" [(ngModel)]="value.address.street" required maxlength="150"></label>
          <label>Número do remetente<input name="senderNumber" [(ngModel)]="value.address.number" required maxlength="20" placeholder="Número ou S/N"></label>
          <label>Complemento do remetente (opcional)<input name="senderComplement" [(ngModel)]="value.address.complement" maxlength="100"></label>
          <label>Bairro do remetente<input name="senderNeighborhood" [(ngModel)]="value.address.neighborhood" required maxlength="100"></label>
          <label>Cidade do remetente<input name="senderCity" [(ngModel)]="value.address.city" required maxlength="100"></label>
          <label>Estado do remetente<select name="senderState" [(ngModel)]="value.address.state" required><option value="">Selecione</option>@for (state of states; track state) { <option [value]="state">{{ state }}</option> }</select></label>
        </div>
        @if (form.submitted && form.invalid) { <p class="error" role="alert">Preencha os campos obrigatórios do remetente e informe um CEP com 8 números.</p> }
        <button class="primary" type="submit" [disabled]="busy()">{{ busy() ? 'Salvando remetente…' : 'Salvar dados do remetente' }}</button>
      </fieldset></form>
    }
  </section>
`, styles: `.sender{margin-top:24px}.fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:0 20px}fieldset{border:0;padding:0;margin:0;min-width:0}` })
export class AdminSender {
  private api = inject(Api); private destroy = inject(DestroyRef); private store = inject(StoreConfig);
  value: Sender = { fullName: '', address: { zipCode: '', street: '', number: '', complement: '', neighborhood: '', city: '', state: '' } };
  states = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');
  loading = signal(true); loaded = signal(false); busy = signal(false); error = signal(''); saved = signal(false);
  constructor() { this.load(); }
  load() {
    this.loading.set(true); this.error.set('');
    this.api.get<{ sender: Sender | null }>('settings/shipping-sender').pipe(takeUntilDestroyed(this.destroy)).subscribe({
      next: data => { if (data.sender) this.value = structuredClone(data.sender); else this.value.fullName = this.store.value().storeName; this.loaded.set(true); this.loading.set(false); },
      error: e => { this.error.set(errorMessage(e)); this.loaded.set(false); this.loading.set(false); },
    });
  }
  save(form: NgForm) {
    if (this.busy() || !this.loaded()) return;
    this.saved.set(false); this.error.set(''); form.form.markAllAsTouched(); if (form.invalid) return;
    this.busy.set(true);
    const sender = { fullName: this.value.fullName.trim(), address: { ...this.value.address, zipCode: this.value.address.zipCode.replace(/\D/g, '') } };
    this.api.put<{ sender: Sender }>('settings/shipping-sender', sender).pipe(takeUntilDestroyed(this.destroy)).subscribe({
      next: data => { this.value = structuredClone(data.sender); this.saved.set(true); this.busy.set(false); },
      error: e => { this.error.set(errorMessage(e)); this.busy.set(false); },
    });
  }
}
