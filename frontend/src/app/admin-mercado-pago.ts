import { Component, DestroyRef, inject, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Api, errorMessage } from './core';

type PaymentSettings = { publicKey: string; notificationUrl: string; accessTokenConfigured: boolean; webhookSecretConfigured: boolean };
@Component({ selector: 'app-admin-mercado-pago', imports: [FormsModule], template: `
  <section class="panel"><h2>Cobrança · Mercado Pago</h2>
    <p class="muted">Cadastre as credenciais da mesma aplicação do Mercado Pago para receber pagamentos. Use credenciais de teste durante a homologação e de produção para cobranças reais.</p>
    @if (loading()) { <p role="status">Carregando credenciais…</p> }
    @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
    @if (saved()) { <p class="notice" role="status">Credenciais salvas. Os próximos pagamentos usarão esta configuração.</p> }
    @if (!loading() && !loaded()) { <button type="button" (click)="load()">Tentar novamente</button> }
    @if (loaded()) {
      <form #form="ngForm" (ngSubmit)="save(form)"><fieldset [disabled]="busy()">
        <label>Public Key<input name="mpPublicKey" [(ngModel)]="value.publicKey" required maxlength="300" autocomplete="off" spellcheck="false"></label>
        <label>Access Token<input type="password" name="mpAccessToken" [(ngModel)]="accessToken" [required]="!value.accessTokenConfigured" maxlength="500" autocomplete="new-password" spellcheck="false" [placeholder]="value.accessTokenConfigured ? 'Cadastrado. Deixe em branco para manter.' : 'Informe o Access Token'"></label>
        <label>Segredo do webhook<input type="password" name="mpWebhookSecret" [(ngModel)]="webhookSecret" maxlength="500" autocomplete="new-password" spellcheck="false" [placeholder]="value.webhookSecretConfigured ? 'Cadastrado. Deixe em branco para manter.' : 'Assinatura secreta das notificações'"></label>
        <label>URL de notificações (HTTPS)<input type="url" name="mpNotificationUrl" [(ngModel)]="value.notificationUrl" pattern="https://.+" maxlength="2048" placeholder="https://sua-loja.com/api/payments/notifications/mercadopago"></label>
        <p class="muted">O Access Token e o segredo não são exibidos após salvar. Configure o webhook no Mercado Pago e informe o segredo para validar as notificações. Valores ainda não cadastrados no painel usam a configuração do servidor.</p>
        @if (form.submitted && (form.invalid || !value.publicKey.trim() || (!value.accessTokenConfigured && !accessToken.trim()))) { <p class="error" role="alert">Informe a Public Key, o Access Token e uma URL HTTPS válida, se preenchida.</p> }
        <button type="submit" class="primary" [disabled]="busy()">{{ busy() ? 'Salvando…' : 'Salvar credenciais do Mercado Pago' }}</button>
      </fieldset></form>
    }
  </section>
`, styles: `:host{display:block;margin-top:24px}fieldset{border:0;padding:0;margin:0;min-width:0}` })
export class AdminMercadoPago {
  private api = inject(Api); private destroy = inject(DestroyRef);
  value: PaymentSettings = { publicKey: '', notificationUrl: '', accessTokenConfigured: false, webhookSecretConfigured: false };
  accessToken = ''; webhookSecret = '';
  loading = signal(true); loaded = signal(false); busy = signal(false); error = signal(''); saved = signal(false);
  constructor() { this.load(); }
  load() {
    this.loading.set(true); this.error.set('');
    this.api.get<PaymentSettings>('settings/mercado-pago').pipe(takeUntilDestroyed(this.destroy)).subscribe({
      next: value => { this.value = value; this.loading.set(false); this.loaded.set(true); },
      error: e => { this.error.set(errorMessage(e)); this.loading.set(false); this.loaded.set(false); },
    });
  }
  save(form: NgForm) {
    if (this.busy() || !this.loaded()) return;
    this.saved.set(false); this.error.set(''); form.form.markAllAsTouched();
    if (form.invalid || !this.value.publicKey.trim() || (!this.value.accessTokenConfigured && !this.accessToken.trim())) return;
    const body = { publicKey: this.value.publicKey.trim(), notificationUrl: this.value.notificationUrl.trim(), ...(this.accessToken.trim() ? { accessToken: this.accessToken.trim() } : {}), ...(this.webhookSecret.trim() ? { webhookSecret: this.webhookSecret.trim() } : {}) };
    this.busy.set(true);
    this.api.put('settings/mercado-pago', body).pipe(takeUntilDestroyed(this.destroy)).subscribe({
      next: () => { this.value.accessTokenConfigured ||= !!body.accessToken; this.value.webhookSecretConfigured ||= !!body.webhookSecret; this.accessToken = ''; this.webhookSecret = ''; form.form.markAsPristine(); this.saved.set(true); this.busy.set(false); },
      error: e => { this.error.set(errorMessage(e)); this.busy.set(false); },
    });
  }
}
