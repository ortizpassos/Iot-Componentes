import { Component, DestroyRef, inject, output, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { interval } from 'rxjs';
import { Api, Order, errorMessage } from './core';
import { ConfirmDialog } from './confirm-dialog';
type PendingOrder = Order & { customer?: { name: string; email: string } };
@Component({ selector: 'app-admin-unpaid-orders', imports: [CurrencyPipe, DatePipe, ConfirmDialog], styleUrl: './admin.css', template: `
<section class="panel"><h2>Pedidos registrados sem pagamento</h2><p>Pedidos aguardando pagamento aparecem aqui assim que são registrados. Após a confirmação do pagamento, passam para a guia Pedidos.</p><button [disabled]="loading() || busy()" (click)="load()">Atualizar pedidos sem pagamento</button></section>
@if (error() && !pending()) { <p role="alert" class="error">{{ error() }}</p> }
@if (notice()) { <p role="status">{{ notice() }}</p> }
@if (pending(); as action) { <app-confirm-dialog [message]="action.message" [busy]="busy()" [error]="error()" (confirmed)="confirm()" (cancelled)="pending.set(null); error.set('')" /> }
@if (loading()) { <p role="status">Carregando pedidos...</p> }
@for (order of orders(); track order._id) { <section class="panel"><h3>Pedido #{{ order._id.slice(-8) }} · Aguardando pagamento</h3><p>{{ order.customer?.name }} · {{ order.customer?.email }}</p><p>{{ order.createdAt | date:'dd/MM/yyyy HH:mm' }}</p>
@for (item of order.items; track item.productId) { <p>{{ item.quantity }} × {{ item.name }} · {{ item.unitPrice | currency:'BRL' }} / unidade</p>@if (item.programmingRequest.requested) { <p>Programação: {{ item.programmingRequest.type }} · {{ item.programmingRequest.requirements }}</p> } }
@if (order.shipping) { <p>Frete: {{ order.shipping.name }} · {{ order.shipping.price | currency:'BRL' }}</p> }
<p><strong>Total do pedido: {{ order.total | currency:'BRL' }}</strong></p>
<details><summary>Dados para entrega</summary>@if (order.checkoutProfile; as delivery) { <p>{{ delivery.fullName }} · CPF {{ delivery.cpf }}</p><p>{{ delivery.address.street }}, {{ delivery.address.number }} {{ delivery.address.complement }}</p><p>{{ delivery.address.neighborhood }} · {{ delivery.address.city }}/{{ delivery.address.state }} · CEP {{ delivery.address.zipCode }}</p> } @else { <p>Dados não informados.</p> }</details>
<button [disabled]="busy()" (click)="request(order, 'PAID')">Marcar como pago</button><button [disabled]="busy()" (click)="request(order, 'CANCELLED')">Cancelar pedido</button></section> }
@if (!loading() && !error() && !orders().length) { <p>Nenhum pedido aguardando pagamento.</p> }
<div class="row"><button [disabled]="loading() || busy() || page() === 1" (click)="move(-1)">Anterior</button><span>Página {{ page() }} · {{ total() }} pedidos sem pagamento</span><button [disabled]="loading() || busy() || page() * 20 >= total()" (click)="move(1)">Próxima</button></div>
` })
export class AdminUnpaidOrders {
  private api = inject(Api); private destroyRef = inject(DestroyRef); changed = output<void>();
  orders = signal<PendingOrder[]>([]); loading = signal(false); busy = signal(false); error = signal(''); notice = signal(''); page = signal(1); total = signal(0);
  pending = signal<{ id: string; status: string; message: string } | null>(null);
  constructor() { this.load(); interval(15000).pipe(takeUntilDestroyed()).subscribe(() => { if (!this.loading() && !this.busy() && !this.pending()) this.load(); }); }
  move(delta: number) { this.page.update(p => p + delta); this.load(); }
  request(order: PendingOrder, status: string) { this.error.set(''); this.pending.set({ id: order._id, status, message: status === 'PAID' ? 'Confirmar que o pagamento do pedido #' + order._id.slice(-8) + ' foi recebido? Esta confirmação é manual e não cobra nem cancela tentativas no Mercado Pago.' : 'Cancelar este pedido? Esta ação não realiza estornos.' }); }
  confirm() {
    const action = this.pending(); if (!action || this.busy()) return;
    this.busy.set(true); this.error.set('');
    this.api.patch('admin/orders/' + action.id + '/status', { status: action.status }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: () => { this.busy.set(false); this.pending.set(null); this.notice.set(action.status === 'PAID' ? 'Pagamento confirmado. O pedido está disponível na guia Pedidos para emitir a etiqueta.' : 'Pedido cancelado.'); this.changed.emit(); this.load(); }, error: e => { this.busy.set(false); this.error.set(errorMessage(e)); } });
  }
  load() { this.loading.set(true); this.error.set(''); this.api.get<{ items: PendingOrder[]; total: number }>('admin/orders/unpaid?page=' + this.page() + '&limit=20').pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: data => { this.orders.set(data.items); this.total.set(data.total); this.loading.set(false); if (!data.items.length && this.page() > 1) { this.page.update(p => p - 1); this.load(); } }, error: e => { this.error.set(errorMessage(e)); this.loading.set(false); } }); }
}
