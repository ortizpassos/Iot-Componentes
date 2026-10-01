import { Component, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Api, Order, errorMessage } from './core';

const statuses: Record<string, string> = { PENDING: 'Pendente', PAID: 'Pago', LABEL_ISSUED: 'Etiqueta emitida', SHIPPED: 'Enviado', CANCELLED: 'Cancelado', FULFILLED: 'Concluído' };
@Component({ imports: [CurrencyPipe, DatePipe, RouterLink], template: `
  <p class="eyebrow">ÁREA DO CLIENTE</p><h1>Meus pedidos</h1><p class="subtitle">Acompanhe os componentes que vão dar vida às suas ideias.</p>
  @if (loading()) { <p role="status">Carregando pedidos…</p> } @else if (error()) { <p class="error" role="alert">{{ error() }} <button (click)="load()">Tentar novamente</button></p> }
  @else { <div class="panel">@for (order of orders(); track order._id) { <a class="order-row" [routerLink]="['/pedidos', order._id]"><div><strong>Pedido #{{ order._id.slice(-8) }}</strong><small class="muted">{{ order.createdAt | date:'dd/MM/yyyy HH:mm' }}</small></div><span class="badge">{{ status(order.status) }}</span><strong>{{ order.total | currency:'BRL' }}</strong><span aria-hidden="true">→</span></a> } @empty { <div class="empty"><h2>Nenhum pedido por aqui</h2><a routerLink="/catalogo">Encontre componentes para começar →</a></div> }</div> }
` })
export class OrdersPage {
  private api = inject(Api); orders = signal<Order[]>([]); error = signal(''); loading = signal(true); status = (value: string) => statuses[value] || value;
  constructor() { this.load(); }
  load() { this.loading.set(true); this.error.set(''); this.api.get<Order[]>('orders').subscribe({ next: data => { this.orders.set(data); this.loading.set(false); }, error: e => { this.error.set(errorMessage(e)); this.loading.set(false); } }); }
}
@Component({ imports: [CurrencyPipe, DatePipe, RouterLink], template: `
  <a class="back-link" routerLink="/pedidos">← Meus pedidos</a><h1>Detalhes do pedido</h1>
  @if (loading()) { <p role="status">Carregando pedido…</p> } @else if (error()) { <p class="error" role="alert">{{ error() }} <button (click)="load()">Tentar novamente</button></p> }
  @if (order(); as data) { <section class="panel"><div class="row"><div><h2>#{{ data._id.slice(-8) }}</h2><p class="muted">{{ data.createdAt | date:'dd/MM/yyyy HH:mm' }}</p></div><span class="badge">{{ status(data.status) }}</span></div>
    @for (item of data.items; track item.productId) { <div class="detail-item"><div class="row"><div><h3>{{ item.name }}</h3><small class="muted">{{ item.sku }} · {{ item.quantity }} × {{ item.unitPrice | currency:'BRL' }}</small></div><strong>{{ item.total | currency:'BRL' }}</strong></div>@if (item.programmingRequest.requested) { <p>Programação: {{ programming(item.programmingRequest.type) }}</p><p class="requirements">{{ item.programmingRequest.requirements }}</p> }</div> }
    <div class="row"><span>Total dos produtos</span><strong>{{ productsTotal(data) | currency:'BRL' }}</strong></div>@if (data.shipping; as shipping) { <div class="row"><span>Frete · {{ shipping.name }}</span><strong>{{ shipping.price | currency:'BRL' }}</strong></div> }<div class="row total"><span>Total do pedido</span><strong>{{ data.total | currency:'BRL' }}</strong></div><p class="muted">Valores registrados no momento do pedido. A solicitação de programação não inclui cobrança ou execução automática.</p>
    @if (canPay(data)) { <a class="button primary" [routerLink]="['/pagamento', data._id]">Ir para pagamento</a> }
    @if (data.trackingCode) { <h2>Rastreamento</h2><p><a [href]="trackingUrl(data.trackingCode)" target="_blank" rel="noopener noreferrer" style="text-decoration: underline" [attr.aria-label]="'Rastrear objeto ' + data.trackingCode + ' nos Correios (abre em nova aba)'">{{ data.trackingCode }}</a></p> } @else if (data.status !== 'CANCELLED') { <h2>Rastreamento</h2><p class="notice" role="status">Estamos preparando sua encomenda, aguarde o seu código para rastreá-la.</p> }
    @if (data.checkoutProfile; as delivery) { <h2>Entrega</h2><p>{{ delivery.fullName }}</p><p>{{ delivery.address.street }}, {{ delivery.address.number }} {{ delivery.address.complement }}</p><p>{{ delivery.address.neighborhood }} · {{ delivery.address.city }}/{{ delivery.address.state }} · CEP {{ delivery.address.zipCode }}</p> }
  </section> }
` })
export class OrderDetailPage {
  trackingUrl(code: string) { return 'https://rastreamento.correios.com.br/app/index.php?objetos=' + encodeURIComponent(code.trim()); }
  canPay(order: Order) { return order.status === 'PENDING' && order.items.every(item => !item.programmingRequest.requested && item.programmingRequest.type === 'NONE'); }
  private api = inject(Api); private route = inject(ActivatedRoute); order = signal<Order | null>(null); error = signal(''); loading = signal(true); status = (value: string) => statuses[value] || value;
  programming(value: string) { return ({ STANDARD: 'Padrão', AI: 'Inteligência artificial', CUSTOM: 'Personalizada' } as Record<string, string>)[value] || value; }
  productsTotal(order: Order) { return order.items.reduce((total, item) => total + item.total, 0); }
  constructor() { this.load(); }
  load() { this.loading.set(true); this.error.set(''); this.api.get<Order>(`orders/${this.route.snapshot.paramMap.get('id')}`).subscribe({ next: data => { this.order.set(data); this.loading.set(false); }, error: e => { this.error.set(errorMessage(e)); this.loading.set(false); } }); }
}
