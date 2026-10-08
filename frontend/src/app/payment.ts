import { ConfirmDialog } from './confirm-dialog';
import { ChangeDetectorRef, Component, DestroyRef, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { FormsModule, NgForm } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom, forkJoin } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Api, Session, errorMessage } from './core';
import { CheckoutProfile, CheckoutProfileForm } from './checkout-profile';

interface PaymentView {
  checkoutProfile?: CheckoutProfile | null;
  orderId: string; total: number; originalTotal?: number; reservationExpiresAt?: string; offer?: { discountPercent: number; freeShipping: boolean; gift?: string; expiresAt?: string }; orderStatus: string; eligible: boolean; canPay: boolean;
  payment: { status: string; statusDetail?: string; method: string; providerId?: string; qrCode?: string; qrBase64?: string; expiresAt?: string; cardSaving?: 'saved' | 'failed' } | null;
}
interface SavedCard { customerId: string | null; card: { id: string; lastFour: string; brand: string } | null }
interface CardData { token: string; payment_method_id: string; issuer_id?: string | number; installments: number; payer: { email: string; type?: string; id?: string; identification: { type: string; number: string } } }
interface Brick { unmount(): Promise<void> }
interface MercadoPagoInstance { bricks(): { create(type: string, container: string, settings: object): Promise<Brick> } }
declare global { interface Window { MercadoPago?: new (key: string, options: object) => MercadoPagoInstance } }
let sdkLoading: Promise<void> | undefined;
function loadSdk() {
  if (window.MercadoPago) return Promise.resolve();
  if (!sdkLoading) sdkLoading = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script'); script.src = 'https://sdk.mercadopago.com/js/v2'; script.async = true;
    const timer = setTimeout(() => { script.remove(); sdkLoading = undefined; reject(new Error('SDK indisponível')); }, 15000);
    script.onload = () => { clearTimeout(timer); if (window.MercadoPago) resolve(); else { sdkLoading = undefined; reject(new Error('SDK indisponível')); } };
    script.onerror = () => { clearTimeout(timer); script.remove(); sdkLoading = undefined; reject(new Error('SDK indisponível')); }; document.head.appendChild(script);
  });
  return sdkLoading;
}
@Component({ imports: [ConfirmDialog, CurrencyPipe, DatePipe, FormsModule, RouterLink, CheckoutProfileForm], template: `
  <a class="back-link" [routerLink]="['/pedidos', id]">← Detalhes do pedido</a><p class="eyebrow">CHECKOUT · MERCADO PAGO</p><h1>Pagamento</h1>
  @if (changing()) { <app-confirm-dialog message="Cancelar o pagamento pendente para escolher outra forma de pagamento? O Pix anterior não deverá mais ser utilizado." [busy]="busy()" [error]="changeError()" (confirmed)="changeMethod()" (cancelled)="changing.set(false)" /> }
  @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
  @if (loading()) { <p role="status">Carregando pagamento…</p> }
  @if (view(); as data) {
    @if (data.canPay && !data.checkoutProfile) { <app-checkout-profile (ready)="profileReady.set(!!$event); cpf = $event?.cpf || ''" /> }
    @if (data.checkoutProfile; as delivery) { <section class="panel"><h2>Entrega deste pedido</h2><p>{{ delivery.fullName }} · {{ delivery.address.street }}, {{ delivery.address.number }} {{ delivery.address.complement }}</p><p>{{ delivery.address.neighborhood }} · {{ delivery.address.city }}/{{ delivery.address.state }} · CEP {{ delivery.address.zipCode }}</p></section> }
    @if (data.payment?.cardSaving === 'saved') { <p class="notice" role="status">Cartão salvo como meio de pagamento padrão para as próximas compras.</p> }
    @if (data.payment?.cardSaving === 'failed') { <p class="notice" role="status">O pagamento foi enviado, mas não foi possível salvar o cartão. Não repita o pagamento por esse motivo.</p> }
    @if (data.payment?.status === 'rejected') { <p class="error" role="alert">O Mercado Pago rejeitou esta tentativa de pagamento. O QR Code desta tentativa não está disponível para pagamento. Gere um novo Pix ou escolha cartão.@if (data.payment?.statusDetail) { <span> Código informado pelo Mercado Pago: {{ data.payment?.statusDetail }}.</span> }</p> }
    <div class="checkout"><section class="panel"><h2>Como deseja pagar?</h2>
      @if (data.orderStatus === 'PAID' || data.orderStatus === 'LABEL_ISSUED' || data.orderStatus === 'FULFILLED' || data.orderStatus === 'SHIPPED') { <p class="notice" role="status">Pagamento aprovado! Seu pedido foi confirmado.</p> }
      @else if (!data.eligible) { <p class="notice">Este pedido não está disponível para pagamento online. Consulte os detalhes do pedido.</p> }
      @else if (data.canPay && !data.checkoutProfile && !profileReady()) { <p class="notice">Complete e salve os dados de entrega acima para continuar.</p> }
      @else if (!enabled()) { <p class="notice">O pagamento está temporariamente indisponível. Seu pedido foi salvo; volte mais tarde para pagar.</p> }
      @else if (data.canPay) {
        @if (reservationCountdown()) { <p class="notice" role="timer">Reserva do estoque válida por <strong>{{ reservationCountdown() }}</strong></p> }
        @if (data.payment) { <p class="notice">A tentativa anterior não foi concluída. Escolha uma forma de pagamento para tentar novamente.</p> }
        <div class="filters"><button [disabled]="busy()" [class.selected]="method() === 'pix'" (click)="choosePix()">Pix</button><button [disabled]="busy()" [class.selected]="method() === 'card'" (click)="chooseCard()">Cartão</button></div>
        @if (method() === 'pix') {
          <p class="muted">Gere o QR Code e pague no aplicativo do seu banco.</p>
          <form #pixForm="ngForm" (ngSubmit)="pix(pixForm)"><label>E-mail do pagador<input name="email" type="email" email required [(ngModel)]="email" [disabled]="busy()"></label><label>CPF do pagador<input name="cpf" inputmode="numeric" pattern="[0-9]{11}" maxlength="11" required [(ngModel)]="cpf" [disabled]="busy()" placeholder="Somente os 11 números"></label><button class="primary full" [disabled]="busy() || pixForm.invalid">{{ busy() ? 'Gerando Pix…' : data.payment?.status === 'rejected' ? 'Gerar novo QR Code Pix' : 'Gerar QR Code Pix' }}</button></form>
        } @else {
          @if (savedCard().card; as card) { <p class="notice">Cartão padrão: {{ card.brand }} · final {{ card.lastFour }}</p><button class="text-button" [disabled]="busy() || sdkBusy()" (click)="forgetCard()">Deixar de usar cartão padrão</button> }
          <label class="save-card"><input type="checkbox" [(ngModel)]="saveCard" [disabled]="busy()">Deseja salvar este cartão como meio de pagamento padrão?</label>
          <p class="muted">Opcional. O cartão será armazenado pelo Mercado Pago. A loja não armazena o número completo nem o código de segurança.</p>
          <p class="muted">Preencha os dados no formulário seguro do Mercado Pago.</p><div id="card-payment"></div>
          @if (sdkBusy()) { <p role="status">Carregando formulário do cartão…</p> }
        }
      } @else {
        @if (data.payment?.status === 'pending') { <button class="secondary" [disabled]="busy() || checking()" (click)="changeError.set(''); changing.set(true)">Alterar meio de pagamento</button> }
        <p class="notice" role="status">{{ paymentLabel(data.payment?.status) }}</p>
        @if (data.payment?.qrBase64 && data.payment?.status === 'pending') { <img class="pix-qr" [src]="'data:image/png;base64,' + data.payment?.qrBase64" alt="QR Code Pix para pagar o pedido"> }
        @if (data.payment?.qrCode && data.payment?.status === 'pending') { <label>Pix copia e cola<textarea readonly [value]="data.payment?.qrCode"></textarea></label><button (click)="copy()">Copiar código Pix</button> }
        @if (data.payment?.expiresAt) { <p class="muted">Vencimento: {{ data.payment?.expiresAt | date:'dd/MM/yyyy HH:mm' }}</p> }
        <p class="muted">A confirmação pode levar alguns instantes. Não faça outro pagamento enquanto este estiver em processamento.</p>
      }
      @if (copied()) { <p role="status">Código Pix copiado.</p> }
      <button class="text-button full" [disabled]="busy() || checking()" (click)="refresh()">{{ checking() ? 'Verificando…' : 'Verificar pagamento' }}</button>
    </section><section class="panel summary"><h2>Resumo</h2><p class="muted">Pedido #{{ id.slice(-8) }}</p><div class="row total"><span>Total</span><strong>{{ data.total | currency:'BRL' }}</strong></div><p class="muted">A confirmação será feita pelo Mercado Pago. O número do cartão e o código de segurança não são enviados à loja.</p></section></div>
  } @else if (!loading()) { <button (click)="load()">Tentar novamente</button> }
`, styles: `.pix-qr{display:block;width:240px;max-width:100%;margin:20px auto}.checkout{margin-top:25px}textarea{word-break:break-all}.save-card{display:flex;align-items:center;gap:10px}.save-card input{width:auto}` })
export class PaymentPage {
  changing = signal(false); changeError = signal('');
  profileReady = signal(false); savedCard = signal<SavedCard>({ customerId: null, card: null }); saveCard = false;
  private api = inject(Api); private session = inject(Session); private destroy = inject(DestroyRef); private cdr = inject(ChangeDetectorRef);
  id = inject(ActivatedRoute).snapshot.paramMap.get('id') || ''; view = signal<PaymentView | null>(null); reservationCountdown = signal('');
  loading = signal(true); enabled = signal(false); busy = signal(false); checking = signal(false); sdkBusy = signal(false); error = signal(''); method = signal<'pix' | 'card'>('pix'); copied = signal(false);
  email = this.session.user()?.email || ''; cpf = ''; private publicKey = ''; private brick?: Brick; private destroyed = false;
  constructor() { this.load(); const timer = setInterval(() => { this.updateReservationCountdown(); if (this.view()?.payment && !this.view()?.canPay && this.view()?.orderStatus === 'PENDING' && !this.busy() && !this.checking()) this.refresh(); }, 1000); this.destroy.onDestroy(() => { this.destroyed = true; clearInterval(timer); void this.brick?.unmount(); }); }
  load() {
    this.loading.set(true); this.error.set('');
    forkJoin({ config: this.api.get<{ enabled: boolean; publicKey: string }>('payments/config'), payment: this.api.get<PaymentView>(`payments/${this.id}`), saved: this.api.get<SavedCard>('payments/saved-card') }).pipe(takeUntilDestroyed(this.destroy)).subscribe({
      next: data => {
        this.enabled.set(data.config.enabled); this.publicKey = data.config.publicKey; this.view.set(data.payment); this.updateReservationCountdown(); this.savedCard.set(data.saved);
        this.cpf = data.payment.checkoutProfile?.cpf || ''; this.loading.set(false);
        if (data.saved.card && data.config.enabled && data.payment.canPay && data.payment.checkoutProfile) void this.chooseCard();
      }, error: e => { this.error.set(errorMessage(e)); this.loading.set(false); },
    });
  }
  refresh() { if (this.checking()) return; this.checking.set(true); this.api.get<PaymentView>(`payments/${this.id}`).pipe(takeUntilDestroyed(this.destroy)).subscribe({ next: data => { this.view.set(data); this.updateReservationCountdown(); this.checking.set(false); }, error: e => { this.error.set(errorMessage(e)); this.checking.set(false); } }); }
  private updateReservationCountdown() { const expiresAt = this.view()?.reservationExpiresAt; if (!expiresAt) { this.reservationCountdown.set(''); return; } const remaining = Math.max(0, Date.parse(expiresAt) - Date.now()); this.reservationCountdown.set(remaining ? `${Math.floor(remaining / 60_000)}:${String(Math.ceil((remaining % 60_000) / 1000)).padStart(2, '0')}` : 'Reserva expirada'); }
  async choosePix() { if (this.busy()) return; await this.brick?.unmount(); this.brick = undefined; this.method.set('pix'); }
  async chooseCard() {
    if (this.busy() || this.sdkBusy()) return;
    this.method.set('card'); this.sdkBusy.set(true); this.error.set(''); this.cdr.detectChanges();
    try {
      await loadSdk(); if (this.destroyed || this.method() !== 'card') return;
      await this.brick?.unmount();
      const mp = new window.MercadoPago!(this.publicKey, { locale: 'pt-BR' });
      const saved = this.savedCard();
      const brick = await mp.bricks().create('payment', 'card-payment', {
        initialization: { amount: this.view()!.total, payer: { email: this.email, ...(saved.card ? { customerId: saved.customerId, cardsIds: [saved.card.id] } : {}) } },
        customization: { paymentMethods: { creditCard: 'all', debitCard: 'all', maxInstallments: 12 }, ...(saved.card ? { visual: { preserveSavedCardsOrder: true, defaultPaymentOption: { savedCardForm: saved.card.id } } } : {}) },
        callbacks: { onReady: () => this.sdkBusy.set(false), onError: () => { this.sdkBusy.set(false); this.error.set('Não foi possível carregar o cartão. Tente novamente ou escolha Pix.'); },
          onSubmit: ({ formData: data }: { formData: CardData }) => this.submit({ method: 'card', token: data.token, paymentMethodId: data.payment_method_id, installments: data.installments,
            saveCard: this.saveCard, useSavedCard: data.payer.type === 'customer',
            ...(data.issuer_id ? { issuerId: String(data.issuer_id) } : {}), payer: { email: data.payer.email || this.email, identification: data.payer.identification || { type: 'CPF', number: this.cpf } } }),
        },
      });
      if (this.destroyed || this.method() !== 'card') await brick.unmount(); else this.brick = brick;
    } catch { this.error.set('Não foi possível carregar o formulário do Mercado Pago. Tente novamente.'); }
    finally { this.sdkBusy.set(false); }
  }
  pix(form: NgForm) { if (!form.invalid) void this.submit({ method: 'pix', payer: { email: this.email.trim(), identification: { type: 'CPF', number: this.cpf } } }); }
  async forgetCard() {
    if (this.busy() || this.sdkBusy()) return;
    this.busy.set(true); this.error.set('');
    try { await firstValueFrom(this.api.delete('payments/saved-card')); this.savedCard.set({ customerId: null, card: null }); this.busy.set(false); await this.chooseCard(); }
    catch (e) { this.error.set(errorMessage(e)); }
    finally { this.busy.set(false); }
  }
  async changeMethod() {
    if (this.busy()) return;
    this.busy.set(true); this.changeError.set('');
    try {
      const data = await firstValueFrom(this.api.post<PaymentView>(`payments/${this.id}/change-method`, {}).pipe(takeUntilDestroyed(this.destroy)));
      this.view.set(data); this.copied.set(false); this.changing.set(false);
      await this.brick?.unmount(); this.brick = undefined;
      this.method.set('pix');
    } catch (e) { this.changeError.set(errorMessage(e)); }
    finally { this.busy.set(false); }
  }
  async submit(body: object) {
    if (this.busy() || !this.view()?.canPay || (!this.view()?.checkoutProfile && !this.profileReady())) return;
    this.busy.set(true); this.error.set('');
    try { const data = await firstValueFrom(this.api.post<PaymentView>(`payments/${this.id}`, body).pipe(takeUntilDestroyed(this.destroy))); this.view.set(data); }
    catch (e) { if (!this.destroyed) { this.error.set(errorMessage(e)); this.refresh(); } }
    finally { this.busy.set(false); }
  }
  paymentLabel(status?: string) { return ({ pending: 'Aguardando pagamento.', in_process: 'Pagamento em análise.', authorized: 'Pagamento em processamento.', creating: 'Confirmando a solicitação com o Mercado Pago.', refunded: 'Pagamento reembolsado.', charged_back: 'Pagamento contestado.' } as Record<string, string>)[status || ''] || 'Aguardando confirmação do Mercado Pago.'; }
  async copy() { try { await navigator.clipboard.writeText(this.view()?.payment?.qrCode || ''); this.copied.set(true); } catch { this.error.set('Selecione e copie o código Pix no campo acima.'); } }
}
