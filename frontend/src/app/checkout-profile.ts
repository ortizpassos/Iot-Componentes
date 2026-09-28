import { Component, DestroyRef, inject, output, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Api, errorMessage } from './core';

export interface CheckoutProfile {
  fullName: string; cpf: string;
  address: { zipCode: string; street: string; number: string; complement?: string; neighborhood: string; city: string; state: string };
}
@Component({ selector: 'app-checkout-profile', imports: [FormsModule], template: `
  <section class="panel delivery"><h2>Dados para entrega</h2>
    @if (loading()) { <p role="status">Carregando seus dados…</p> }
    @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
    @if (!loading() && !loaded()) { <button type="button" (click)="load()">Tentar carregar dados novamente</button> }
    @if (loaded()) {
      @if (!editing()) {
        <p><strong>{{ profile.fullName }}</strong></p><p>{{ profile.address.street }}, {{ profile.address.number }} {{ profile.address.complement }}</p>
        <p>{{ profile.address.neighborhood }} · {{ profile.address.city }}/{{ profile.address.state }} · CEP {{ profile.address.zipCode }}</p>
        <button type="button" (click)="edit()">Alterar dados de entrega</button>
      } @else {
        <p class="muted">Antes da primeira compra, informe seus dados. Eles ficarão salvos para as próximas compras.</p>
        <form #form="ngForm" (ngSubmit)="save(form)">
          <fieldset [disabled]="busy()">
            <label>Nome completo<input name="fullName" autocomplete="name" [(ngModel)]="profile.fullName" required maxlength="150" pattern="\\S+\\s+\\S.*"></label>
            <label>CPF<input name="cpf" inputmode="numeric" [(ngModel)]="profile.cpf" required maxlength="14" placeholder="000.000.000-00"></label>
            <div class="address-grid">
              <label>CEP<input name="zipCode" autocomplete="postal-code" inputmode="numeric" [(ngModel)]="profile.address.zipCode" required maxlength="9" placeholder="00000-000"></label>
              <label>Rua / Avenida<input name="street" autocomplete="address-line1" [(ngModel)]="profile.address.street" required maxlength="150"></label>
              <label>Número<input name="number" [(ngModel)]="profile.address.number" required maxlength="20" placeholder="Número ou S/N"></label>
              <label>Complemento (opcional)<input name="complement" autocomplete="address-line2" [(ngModel)]="profile.address.complement" maxlength="100"></label>
              <label>Bairro<input name="neighborhood" [(ngModel)]="profile.address.neighborhood" required maxlength="100"></label>
              <label>Cidade<input name="city" autocomplete="address-level2" [(ngModel)]="profile.address.city" required maxlength="100"></label>
              <label>Estado<select name="state" autocomplete="address-level1" [(ngModel)]="profile.address.state" required><option value="">Selecione</option>@for (state of states; track state) { <option [value]="state">{{ state }}</option> }</select></label>
            </div>
            <button class="primary" [disabled]="form.invalid || busy()">{{ busy() ? 'Salvando…' : 'Salvar dados e continuar' }}</button>
          </fieldset>
        </form>
      }
    }
  </section>
`, styles: `.delivery{margin:24px 0}.address-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:0 16px}fieldset{border:0;padding:0;margin:0;min-width:0}` })
export class CheckoutProfileForm {
  private api = inject(Api); private destroy = inject(DestroyRef);
  ready = output<CheckoutProfile | null>();
  loading = signal(true); loaded = signal(false); editing = signal(true); busy = signal(false); error = signal('');
  states = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');
  profile: CheckoutProfile = { fullName: '', cpf: '', address: { zipCode: '', street: '', number: '', complement: '', neighborhood: '', city: '', state: '' } };
  constructor() { this.load(); }
  load() {
    this.loading.set(true); this.error.set('');
    this.api.get<{ profile: CheckoutProfile | null }>('users/me/checkout-profile').pipe(takeUntilDestroyed(this.destroy)).subscribe({
      next: data => { if (data.profile) { this.profile = data.profile; this.editing.set(false); this.ready.emit(data.profile); } this.loaded.set(true); this.loading.set(false); },
      error: e => { this.error.set(errorMessage(e)); this.loading.set(false); },
    });
  }
  edit() { this.editing.set(true); this.ready.emit(null); }
  save(form: NgForm) {
    if (form.invalid || this.busy()) return;
    this.busy.set(true); this.error.set('');
    const profile = { ...this.profile, fullName: this.profile.fullName.trim(), cpf: this.profile.cpf.replace(/\D/g, ''), address: { ...this.profile.address, zipCode: this.profile.address.zipCode.replace(/\D/g, '') } };
    this.api.put<{ profile: CheckoutProfile }>('users/me/checkout-profile', profile).pipe(takeUntilDestroyed(this.destroy)).subscribe({
      next: data => { this.profile = data.profile; this.editing.set(false); this.busy.set(false); this.ready.emit(data.profile); },
      error: e => { this.error.set(errorMessage(e)); this.busy.set(false); },
    });
  }
}
