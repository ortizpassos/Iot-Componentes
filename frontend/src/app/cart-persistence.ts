import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import { Subject, Subscription, catchError, concatMap, of, tap } from 'rxjs';
import { Api, Cart, CartLine, Product, Session } from './core';
const key = 'iot-guest-cart-v1';
const serialize = (lines: CartLine[]) => lines.map(l => ({ productId: l.product._id, quantity: l.quantity, type: l.type, requirements: l.requirements }));
@Injectable({ providedIn: 'root' })
export class CartPersistence {
  private cart = inject(Cart); private session = inject(Session); private api = inject(Api);
  private ready = signal(false); private last = ''; private owner = ''; private initialized = false;
  loggingOut = signal(false);
  logoutError = signal('');
  private logoutResolve?: (saved: boolean) => void;
  private writes = new Subject<{ items: ReturnType<typeof serialize>; done?: (saved: boolean) => void }>();
  private writer?: Subscription;
  private retry = signal(0);
  constructor() {
    effect(onCleanup => {
      const token = this.session.token(); const retry = this.retry();
      untracked(() => {
        this.ready.set(false); this.cart.restoring.set(true); this.cart.persistenceError.set('');
        this.writer?.unsubscribe(); this.logoutResolve?.(false); this.logoutResolve = undefined;
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
        this.writer = this.writes.pipe(concatMap(job => this.api.put('cart', { items: job.items }).pipe(catchError(() => {
          this.cart.persistenceError.set('Não foi possível salvar o carrinho. Tente novamente.'); return of(null);
        }), tap(result => { if (result) this.clearDraft(token, job.items); job.done?.(!!result); })))).subscribe(result => { if (result) { this.cart.persistenceError.set(''); try { localStorage.removeItem(key); } catch {} } });
        const requests = new Subscription();
        const request = this.api.get<{ lines: CartLine[] }>('cart').subscribe({ next: data => {
          const draft = this.readDraft(token);
          const recovery = draft ? [...draft.items, ...guest] : guest;
          const lines = draft ? [] : Array.isArray(data.lines) ? data.lines : [];
          if (!recovery.length) { this.finish(lines, !!draft); return; }
          const catalog = this.api.get<Product[]>('products').subscribe({ next: products => {
            for (const item of recovery) {
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
        if (items.every(i => Number.isInteger(i.quantity) && i.quantity > 0 && i.quantity <= 10000)) this.writes.next({ items });
      } else { try { localStorage.setItem(key, value); } catch {} }
    });
  }
  async logout(): Promise<boolean> {
    if (this.loggingOut()) return false;
    this.loggingOut.set(true); this.logoutError.set('');
    const token = this.session.token();
    const items = serialize(this.cart.lines());
    const canSave = token && this.owner === token && this.ready();
    if (token && (canSave || items.length)) this.saveDraft(token, items);
    this.ready.set(false);
    if (canSave) {
      // A slow or unavailable API must never prevent signing out.
      await new Promise<boolean>(resolve => {
        const timer = setTimeout(() => resolve(false), 1500);
        this.logoutResolve = saved => { clearTimeout(timer); resolve(saved); };
        this.writes.next({ items, done: this.logoutResolve });
      });
    }
    this.logoutResolve = undefined;
    this.session.clear(); this.cart.clear(); this.loggingOut.set(false);
    return true;
  }
  private draftKey(token: string): string | null {
    // Used only to partition browser drafts, never for API authorization.
    try {
      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      if (typeof payload.sub === 'string' && payload.sub) return 'iot-cart-draft-v1:' + payload.sub;
    } catch {}
    const user = this.session.user();
    const id = user?._id || user?.id || user?.email;
    return id ? 'iot-cart-draft-v1:' + id : null;
  }
  private saveDraft(token: string, items: ReturnType<typeof serialize>) {
    const key = this.draftKey(token);
    if (key) try { localStorage.setItem(key, JSON.stringify({ items })); } catch {}
  }
  private readDraft(token: string): { items: ReturnType<typeof serialize> } | null {
    const key = this.draftKey(token);
    try { const data = key ? JSON.parse(localStorage.getItem(key) || 'null') : null;
      return data && Array.isArray(data.items) && data.items.length <= 100 && data.items.every((i: any) => i && typeof i.productId === 'string' && Number.isInteger(i.quantity) && i.quantity > 0) ? data : null;
    } catch { return null; }
  }
  private clearDraft(token: string, items: ReturnType<typeof serialize>) {
    const key = this.draftKey(token);
    if (key && JSON.stringify(this.readDraft(token)?.items) === JSON.stringify(items)) {
      try { localStorage.removeItem(key); } catch {}
    }
  }
  private readGuest(): any[] { try { const data = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(data) ? data.filter(i => i && typeof i.productId === 'string').slice(0,100) : []; } catch { return []; } }
  private finish(lines: CartLine[], upload: boolean) {
    this.last = JSON.stringify(serialize(lines)); this.cart.lines.set(lines); this.cart.restoring.set(false); this.ready.set(true);
    if (this.owner) { if (upload) {
      const items = serialize(lines);
      if (this.readDraft(this.owner)) this.saveDraft(this.owner, items);
      this.writes.next({ items });
    } }
    else { try { localStorage.setItem(key, this.last); } catch {} }
  }
  private failed() { this.cart.restoring.set(false); this.cart.persistenceError.set('Não foi possível recuperar o carrinho. Tente novamente.'); }
  retrySave() { if (this.ready()) { this.writes.next({ items: serialize(this.cart.lines()) }); } else { this.retry.update(n => n + 1); } }
}
