import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of, throwError, timeout } from 'rxjs';
import type { CheckoutProfile } from './checkout-profile';

const API_BASE_URL = ['localhost', '127.0.0.1'].includes(window.location.hostname)
  ? '/api'
  : 'https://iot-componentes-bo23.onrender.com/api';

export function resolveApiUrl(value: string) {
  return value.startsWith('/api/') ? `${API_BASE_URL}${value.slice(4)}` : value;
}

export interface User { id?: string; _id?: string; name: string; email: string; role: string }
export interface Product { datasheetUrl?: string; references?: { label: string; url: string }[]; _id: string; name: string; sku: string; description?: string; imageUrl?: string; additionalImageUrls?: string[]; specifications?: Record<string, unknown>; type: string; price: number; stock: number; manufacturer?: string; model?: string; programming?: { supported?: boolean; platform?: string; chip?: string } }
export interface Programming { requested: boolean; type: 'NONE' | 'STANDARD' | 'AI' | 'CUSTOM'; requirements?: string }
export interface Order { _id: string; status: string; total: number; createdAt: string; checkoutProfile?: CheckoutProfile; items: { productId: string; name: string; sku: string; quantity: number; unitPrice: number; total: number; programmingRequest: Programming }[] }
export interface Device { _id: string; name: string; board: string; model?: string; online: boolean }
export interface Project { _id: string; name: string; description?: string; status: string; device?: Device }
export interface CartLine { product: Product; quantity: number; type: Programming['type']; requirements: string }

@Injectable({ providedIn: 'root' })
export class Session {
  token = signal(sessionStorage.getItem('iot-token') || '');
  user = signal<User | null>(null);
  set(token: string, user: User) { sessionStorage.setItem('iot-token', token); this.token.set(token); this.user.set(user); }
  clear() { sessionStorage.removeItem('iot-token'); this.token.set(''); this.user.set(null); }
}
@Injectable({ providedIn: 'root' })
export class Cart {
  lines = signal<CartLine[]>([]);
  totalQuantity = computed(() => this.lines().reduce((sum, line) => sum + (Number.isInteger(line.quantity) && line.quantity > 0 ? line.quantity : 0), 0));
  setQuantity(id: string, quantity: number) { this.lines.update(lines => lines.map(line => line.product._id === id ? { ...line, quantity } : line)); }
  canAdd(product: Product) { return product.stock > 0 && (this.lines().find(line => line.product._id === product._id)?.quantity || 0) < Math.min(10000, product.stock); }
  add(product: Product) {
    if (!this.canAdd(product)) return false;
    this.lines.update(lines => lines.some(l => l.product._id === product._id)
      ? lines.map(l => l.product._id === product._id ? { ...l, quantity: Math.min(10000, product.stock, l.quantity + 1) } : l)
      : [...lines, { product, quantity: 1, type: 'NONE', requirements: '' }]);
    return true;
  }
  remove(id: string) { this.lines.update(lines => lines.filter(l => l.product._id !== id)); }
  clear() { this.lines.set([]); }
}
@Injectable({ providedIn: 'root' })
export class Api {
  private http = inject(HttpClient);
  download(path: string, post = false) { return post ? this.http.post(`${API_BASE_URL}/${path}`, {}, { responseType: 'blob' }) : this.http.get(`${API_BASE_URL}/${path}`, { responseType: 'blob' }); }
  get<T>(path: string) { return this.http.get<T>(`${API_BASE_URL}/${path}`); }
  post<T>(path: string, body: unknown) { return this.http.post<T>(`${API_BASE_URL}/${path}`, body); }
  put<T>(path: string, body: unknown) { return this.http.put<T>(`${API_BASE_URL}/${path}`, body); }
  patch<T>(path: string, body: unknown) { return this.http.patch<T>(`${API_BASE_URL}/${path}`, body); }
  delete<T>(path: string) { return this.http.delete<T>(`${API_BASE_URL}/${path}`); }
}
export function errorMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0 || error.status >= 500) return 'Não foi possível acessar a API. Verifique se o backend está em execução e tente novamente.';
    const message = error.error?.message;
    return Array.isArray(message) ? message.join(' · ') : typeof message === 'string' ? message : 'Não foi possível concluir a solicitação.';
  }
  return 'A solicitação não foi concluída. Tente novamente.';
}
export const apiInterceptor: HttpInterceptorFn = (req, next) => {
  const session = inject(Session); const router = inject(Router); const cart = inject(Cart);
  if (!req.url.startsWith(`${API_BASE_URL}/`)) return next(req);
  const authenticated = !req.url.startsWith(`${API_BASE_URL}/auth/`) && !!session.token();
  const token = session.token();
  return next(authenticated ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req).pipe(
    timeout(15000),
    catchError(error => {
      if (error.status === 401 && authenticated && session.token() === token) {
        const returnUrl = router.url;
        session.clear(); cart.clear();
        void router.navigate(['/login'], { queryParams: { expired: '1', returnUrl } });
      }
      return throwError(() => error);
    }),
  );
};
export const authGuard: CanActivateFn = (_, state) => inject(Session).token() ? true : inject(Router).createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });

export const adminGuard: CanActivateFn = (_, state) => {
  const session = inject(Session); const router = inject(Router); const api = inject(Api);
  if (!session.token()) return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
  return api.get<{ allowed: boolean }>('admin/access').pipe(
    map(result => result.allowed ? true : router.createUrlTree(['/acesso-restrito'])),
    catchError(error => of(error.status === 401
      ? router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } })
      : router.createUrlTree(['/acesso-restrito'], { queryParams: { unavailable: error.status === 403 ? undefined : '1' } }))),
  );
};
