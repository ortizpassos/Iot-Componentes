import { Component, DestroyRef, inject, output, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { interval } from 'rxjs';
import { Api, Order, errorMessage } from './core';
import { ConfirmDialog } from './confirm-dialog';
type PendingOrder = Order & { customer?: { name: string; email: string } };
@Component({ selector: 'app-admin-unpaid-orders', imports: [CurrencyPipe, DatePipe, FormsModule, ConfirmDialog], styleUrl: './admin.css', template: `
<section class="panel"><h2>Pedidos registrados sem pagamento</h2><p>Pedidos aguardando pagamento aparecem aqui assim que são registrados. Após a confirmação do pagamento, passam para a guia Pedidos.</p><button [disabled]="loading() || busy()" (click)="load()">Atualizar pedidos sem pagamento</button><button class="primary" [disabled]="loading() || busy() || !orders().length" (click)="openOfferForAll()">Enviar oferta para todas</button></section>
@if (error() && !pending()) { <p role="alert" class="error">{{ error() }}</p> }
@if (notice()) { <p role="status">{{ notice() }}</p> }
@if (pending(); as action) { <app-confirm-dialog [message]="action.message" [busy]="busy()" [error]="error()" (confirmed)="confirm()" (cancelled)="pending.set(null); error.set('')" /> }
@if (offerOrder() || offerAllOpen()) { <div class="admin-project-modal" role="dialog" aria-modal="true" aria-labelledby="offer-title"><section class="panel admin-project-modal__content"><div class="admin-project-modal__header"><h2 id="offer-title">{{ offerAllOpen() ? 'Enviar oferta para todas as compras' : 'Enviar oferta para #' + offerOrder()!._id.slice(-8) }}</h2><button type="button" [disabled]="busy()" (click)="closeOffer()">Fechar</button></div><form #offerForm="ngForm" (ngSubmit)="sendOffer()"><fieldset [disabled]="busy()"><label>Desconto (%)<input name="discount" type="number" [(ngModel)]="offerDiscount" min="0" max="100" step="1"></label><label class="check"><input name="freeShipping" type="checkbox" [(ngModel)]="offerFreeShipping"> Oferecer frete grátis</label><label>Brinde (opcional)<input name="gift" [(ngModel)]="offerGift" maxlength="200" placeholder="Ex.: cabo USB ou suporte"></label><p class="muted">A oferta ficará válida por 24 horas depois que o cliente abrir o pedido. A reserva do estoque continua limitada a 5 minutos na tela de pagamento.</p><button class="primary" [disabled]="busy() || (!offerDiscount && !offerFreeShipping && !offerGift.trim())">{{ busy() ? 'Enviando...' : 'Enviar oferta por e-mail' }}</button><button type="button" [disabled]="busy()" (click)="closeOffer()">Cancelar</button></fieldset></form></section></div> }
@if (loading()) { <p role="status">Carregando pedidos...</p> }
@for (order of orders(); track order._id) { <section class="panel"><h3>Pedido #{{ order._id.slice(-8) }} · Aguardando pagamento</h3><p>{{ order.customer?.name }} · {{ order.customer?.email }}</p><p>{{ order.createdAt | date:'dd/MM/yyyy HH:mm' }}</p>
@for (item of order.items; track item.productId) { <p>{{ item.quantity }} × {{ item.name }} · {{ item.unitPrice | currency:'BRL' }} / unidade</p>@if (item.programmingRequest.requested) { <p>Programação: {{ item.programmingRequest.type }} · {{ item.programmingRequest.requirements }}</p> } }
@if (order.shipping) { <p>Frete: {{ order.shipping.name }} · {{ order.shipping.price | currency:'BRL' }}</p> }
<p><strong>Total do pedido: {{ order.total | currency:'BRL' }}</strong></p>
<details><summary>Dados para entrega</summary>@if (order.checkoutProfile; as delivery) { <p>{{ delivery.fullName }} · CPF {{ delivery.cpf }}</p><p>{{ delivery.address.street }}, {{ delivery.address.number }} {{ delivery.address.complement }}</p><p>{{ delivery.address.neighborhood }} · {{ delivery.address.city }}/{{ delivery.address.state }} · CEP {{ delivery.address.zipCode }}</p> } @else { <p>Dados não informados.</p> }</details>
<div class="row"><button [disabled]="busy()" (click)="openOffer(order)">Enviar oferta</button><button [disabled]="busy()" (click)="request(order, 'PAID')">Marcar como pago</button><button [disabled]="busy()" (click)="request(order, 'CANCELLED')">Cancelar pedido</button></div></section> }
@if (!loading() && !error() && !orders().length) { <p>Nenhum pedido aguardando pagamento.</p> }
<div class="row"><button [disabled]="loading() || busy() || page() === 1" (click)="move(-1)">Anterior</button><span>Página {{ page() }} · {{ total() }} pedidos sem pagamento</span><button [disabled]="loading() || busy() || page() * 20 >= total()" (click)="move(1)">Próxima</button></div>
` })
export class AdminUnpaidOrders {
  private api = inject(Api); private destroyRef = inject(DestroyRef); changed = output<void>();
  orders = signal<PendingOrder[]>([]); loading = signal(false); busy = signal(false); error = signal(''); notice = signal(''); page = signal(1); total = signal(0);
  pending = signal<{ id: string; status: string; message: string } | null>(null);
  offerOrder = signal<PendingOrder | null>(null);
  offerAllOpen = signal(false);
  offerDiscount = 0; offerFreeShipping = false; offerGift = '';
  constructor() { this.load(); interval(15000).pipe(takeUntilDestroyed()).subscribe(() => { if (!this.loading() && !this.busy() && !this.pending()) this.load(); }); }
  move(delta: number) { this.page.update(p => p + delta); this.load(); }
  request(order: PendingOrder, status: string) { this.error.set(''); this.pending.set({ id: order._id, status, message: status === 'PAID' ? 'Confirmar que o pagamento do pedido #' + order._id.slice(-8) + ' foi recebido? Esta confirmação é manual e não cobra nem cancela tentativas no Mercado Pago.' : 'Cancelar este pedido? Esta ação não realiza estornos.' }); }
  openOffer(order: PendingOrder) {
    this.error.set(''); this.offerOrder.set(order); this.offerDiscount = 0; this.offerFreeShipping = false; this.offerGift = '';
  }
  openOfferForAll() { this.error.set(''); this.offerAllOpen.set(true); this.offerDiscount = 0; this.offerFreeShipping = false; this.offerGift = ''; }
  closeOffer() { this.offerOrder.set(null); this.offerAllOpen.set(false); }
  sendOffer() {
    const order = this.offerOrder(); if (!order && !this.offerAllOpen()) return; if (this.busy()) return;
    if (!this.offerDiscount && !this.offerFreeShipping && !this.offerGift.trim()) { this.error.set('Informe um desconto, frete grátis ou brinde.'); return; }
    this.busy.set(true); this.error.set('');
    const path = order ? 'admin/orders/' + order._id + '/offer' : 'admin/orders/unpaid/offer';
    this.api.post(path, { discountPercent: this.offerDiscount, freeShipping: this.offerFreeShipping, ...(this.offerGift.trim() ? { gift: this.offerGift.trim() } : {}) }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: result => { this.busy.set(false); this.closeOffer(); this.notice.set(order ? 'Oferta enviada por e-mail.' : `${(result as { sent: number }).sent} oferta(s) enviada(s) por e-mail.`); this.load(); }, error: e => { this.busy.set(false); this.error.set(errorMessage(e)); } });
  }
  confirm() {
    const action = this.pending(); if (!action || this.busy()) return;
    this.busy.set(true); this.error.set('');
    this.api.patch('admin/orders/' + action.id + '/status', { status: action.status }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: () => { this.busy.set(false); this.pending.set(null); this.notice.set(action.status === 'PAID' ? 'Pagamento confirmado. O pedido está disponível na guia Pedidos para emitir a etiqueta.' : 'Pedido cancelado.'); this.changed.emit(); this.load(); }, error: e => { this.busy.set(false); this.error.set(errorMessage(e)); } });
  }
  load() { this.loading.set(true); this.error.set(''); this.api.get<{ items: PendingOrder[]; total: number }>('admin/orders/unpaid?page=' + this.page() + '&limit=20').pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: data => { this.orders.set(data.items); this.total.set(data.total); this.loading.set(false); if (!data.items.length && this.page() > 1) { this.page.update(p => p - 1); this.load(); } }, error: e => { this.error.set(errorMessage(e)); this.loading.set(false); } }); }
}
