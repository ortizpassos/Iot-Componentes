import { Component, inject, output, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { Api, errorMessage } from './core';
interface AbandonedCart { _id: string; customer?: { name: string; email: string }; lastActivityAt: string; total: number; items: { productId: string; name: string; quantity: number; price: number }[] }
@Component({ selector: 'app-admin-abandoned-carts', imports: [CurrencyPipe, DatePipe], styleUrl: './admin.css', template: `
<section class="panel"><h2>Carrinhos abandonados</h2><p>Carrinhos de clientes identificados sem alterações há pelo menos 30 minutos. Valores estimados dos produtos, sem frete. Compras registradas sem pagamento ficam na aba própria.</p><button [disabled]="loading()" (click)="load()">Atualizar carrinhos</button></section>
@if (error()) { <p class="error" role="alert">{{ error() }}</p> }
@if (loading()) { <p role="status">Carregando carrinhos...</p> }
@for (cart of items(); track cart._id) { <section class="panel"><h3>{{ cart.customer?.name || 'Conta indisponível' }}</h3><p style="overflow-wrap:anywhere">{{ cart.customer?.email }}</p><p>Última atividade: {{ cart.lastActivityAt | date:'dd/MM/yyyy HH:mm' }}</p>
@for (item of cart.items; track item.productId) { <p>{{ item.quantity }} × {{ item.name }} · {{ item.price | currency:'BRL' }} / unidade</p> }
<strong>Total estimado: {{ cart.total | currency:'BRL' }}</strong></section> }
@if (!loading() && !error() && !items().length) { <p>Nenhum carrinho abandonado encontrado.</p> }
<div class="row"><button [disabled]="loading() || page() === 1" (click)="move(-1)">Anterior</button><span>Página {{ page() }} · {{ total() }} carrinhos</span><button [disabled]="loading() || page() * 20 >= total()" (click)="move(1)">Próxima</button></div>
` })
export class AdminAbandonedCarts {
  changed = output<void>();
  private api = inject(Api); items = signal<AbandonedCart[]>([]); loading = signal(false); error = signal(''); page = signal(1); total = signal(0);
  constructor() { this.load(); }
  move(delta: number) { this.page.update(p => p + delta); this.load(); }
  load() { this.loading.set(true); this.error.set(''); this.api.get<{ items: AbandonedCart[]; total: number }>('admin/abandoned-carts?page=' + this.page() + '&limit=20').subscribe({ next: data => { this.items.set(data.items); this.total.set(data.total); this.loading.set(false); }, error: e => { this.error.set(errorMessage(e)); this.loading.set(false); } }); }
}
