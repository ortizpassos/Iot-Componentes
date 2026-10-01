import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import { Subject, Subscription, catchError, concatMap, of } from 'rxjs';
import { Api, Cart, CartLine, Product, Session } from './core';
const key = 'iot-guest-cart-v1';
const serialize = (lines: CartLine[]) => lines.map(l => ({ productId: l.product._id, quantity: l.quantity, type: l.type, requirements: l.requirements }));
@Injectable({ providedIn: 'root' })
export class CartPersistence {
  private cart = inject(Cart); private session = inject(Session); private api = inject(Api);
  private ready = signal(false); private last = ''; private owner = ''; private initialized = false;
  private writes = new Subject<ReturnType<typeof serialize>>();
  private writer?: Subscription;
  private retry = signal(0);
  constructor() {
    effect(onCleanup => {
      const token = this.session.token(); const retry = this.retry();
      untracked(() => {
        this.ready.set(false); this.cart.restoring.set(true); this.cart.persistenceError.set('');
        this.writer?.unsubscribe();
        const current = serialize(this.cart.lines());
        const guest = retry > 0 && this.owner === token ? (current.length ? current : this.readGuest()) : !this.owner ? this.readGuest() : [];
        this.owner = token;
        this.cart.lines.set([]);
        if (!token) {
          const initial = this.initialized && !retry ? [] : guest;
          this.initialized = true;
          if (!initial.length) { this.finish([], false); return; }
          const request = this.api.get<Product[]>('products').subscribe({ next: products => this.finish(initial.flatMap((item: any) => {
            const product = products.find(p => p._id === item.productId && p.stock > 0);
            return product && Number.isInteger(item.quantity) && item.quantity > 0 ? [{ product, quantity: Math.min(item.quantity, product.stock), type: product.programming?.supported && ['NONE','STANDARD','AI','CUSTOM'].includes(item.type) ? item.type : 'NONE', requirements: typeof item.requirements === 'string' ? item.requirements.slice(0,10000) : '' }] : [];
          }), false), error: () => this.failed() });
          onCleanup(() => request.unsubscribe()); return;
        }
        this.initialized = true;
        this.writer = this.writes.pipe(concatMap(items => this.api.put('cart', { items }).pipe(catchError(() => {
          this.cart.persistenceError.set('Não foi possível salvar o carrinho. Tente novamente.'); return of(null);
        })))).subscribe(result => { if (result) { this.cart.persistenceError.set(''); try { localStorage.removeItem(key); } catch {} } });
        const requests = new Subscription();
        const request = this.api.get<{ lines: CartLine[] }>('cart').subscribe({ next: data => {
          const lines = Array.isArray(data.lines) ? data.lines : [];
          if (!guest.length) { this.finish(lines, false); return; }
          const catalog = this.api.get<Product[]>('products').subscribe({ next: products => {
            for (const item of guest) {
              const product = products.find(p => p._id === item.productId && p.stock > 0);
              if (!product || !Number.isInteger(item.quantity) || item.quantity < 1) continue;
              const existing = lines.find(l => l.product._id === product._id);
              if (existing) existing.quantity = Math.min(product.stock, Math.max(existing.quantity, item.quantity), 10000);
              else if (lines.length < 100) lines.push({ product, quantity: Math.min(product.stock, item.quantity, 10000), type: product.programming?.supported && ['NONE','STANDARD','AI','CUSTOM'].includes(item.type) ? item.type : 'NONE', requirements: product.programming?.supported && typeof item.requirements === 'string' ? item.requirements.slice(0,10000) : '' });
            }
            this.finish(lines, true);
          }, error: () => this.failed() });
          requests.add(catalog);
        }, error: () => this.failed() });
        requests.add(request);
        onCleanup(() => { requests.unsubscribe(); this.writer?.unsubscribe(); });
      });
    });
    effect(() => {
      const lines = this.cart.lines(); const ready = this.ready(); const token = this.session.token();
      if (!ready || token !== this.owner) return;
      const items = serialize(lines); const value = JSON.stringify(items);
      if (value === this.last) return;
      this.last = value;
      if (token) {
        if (items.every(i => Number.isInteger(i.quantity) && i.quantity > 0 && i.quantity <= 10000)) this.writes.next(items);
      } else { try { localStorage.setItem(key, value); } catch {} }
    });
  }
  private readGuest(): any[] { try { const data = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(data) ? data.filter(i => i && typeof i.productId === 'string').slice(0,100) : []; } catch { return []; } }
  private finish(lines: CartLine[], upload: boolean) {
    this.last = JSON.stringify(serialize(lines)); this.cart.lines.set(lines); this.cart.restoring.set(false); this.ready.set(true);
    if (this.owner) { if (upload) this.writes.next(serialize(lines)); }
    else { try { localStorage.setItem(key, this.last); } catch {} }
  }
  private failed() { this.cart.restoring.set(false); this.cart.persistenceError.set('Não foi possível recuperar o carrinho. Tente novamente.'); }
  retrySave() { if (this.ready()) { this.writes.next(serialize(this.cart.lines())); } else { this.retry.update(n => n + 1); } }
}
