import { Component, inject, signal } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { NavigationEnd, provideRouter, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { StoreConfig } from './app/store-config';
import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { LOCALE_ID } from '@angular/core';
import { Api, Cart, Session, User, apiInterceptor, authGuard, adminGuard } from './app/core';
registerLocaleData(localePt);

@Component({
  selector: 'app-root', imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    @if (adminLayout()) { <router-outlet /> } @else {
    <header class="topbar"><a class="brand" routerLink="/catalogo"><span class="brand-icon">⌘</span>{{ store.value().storeName }}</a><span class="tagline">{{ store.value().tagline }}</span>
      <div class="account"><a class="cart-link" routerLink="/carrinho" [attr.aria-label]="'Carrinho, ' + cart.totalQuantity() + ' itens'" title="Abrir carrinho"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 3h3l3 12h11l3-9H6"/><circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/></svg><span class="cart-count" aria-hidden="true">{{ cart.totalQuantity() }}</span></a>@if (session.token()) { <span>{{ session.user()?.name || 'Minha conta' }}</span><button class="text-button" (click)="logout()">Sair</button> } @else { <a routerLink="/login">Entrar / Cadastrar</a> }</div>
    </header>
    <div class="layout"><aside><div class="nav-label">WORKSPACE</div><nav aria-label="Navegação principal">
      <a routerLink="/catalogo" routerLinkActive="active">◈ <span>Catálogo</span></a>
      <a routerLink="/carrinho" routerLinkActive="active">▤ <span>Carrinho</span><small>{{ cart.totalQuantity() }}</small></a>
      <a routerLink="/pedidos" routerLinkActive="active">▦ <span>Meus pedidos</span></a>
      <a routerLink="/dispositivos" routerLinkActive="active">▣ <span>Dispositivos</span></a>
      <a routerLink="/projetos" routerLinkActive="active">◇ <span>Projetos</span></a>
    </nav><div class="sidebar-note"><span class="dot"></span> Seu próximo projeto<br>começa com uma ideia.</div></aside><main id="main"><router-outlet /></main></div>
    }
  `,
})
class App {
  session = inject(Session); cart = inject(Cart); private router = inject(Router); private api = inject(Api);
  store = inject(StoreConfig); adminLayout = signal(false);
  constructor() {
    this.router.events.pipe(takeUntilDestroyed()).subscribe(event => { if (event instanceof NavigationEnd) this.adminLayout.set(event.urlAfterRedirects.split('?')[0] === '/adm'); });
    this.store.load();
    if (this.session.token()) this.api.get<User>('users/me').subscribe({ next: user => this.session.user.set(user), error: () => {} });
  }
  logout() { this.session.clear(); this.cart.clear(); void this.router.navigate(['/login']); }
}
bootstrapApplication(App, { providers: [
  { provide: LOCALE_ID, useValue: 'pt-BR' }, provideHttpClient(withInterceptors([apiInterceptor])),
  provideRouter([
    { path: 'adm', canActivate: [adminGuard], loadComponent: () => import('./app/admin').then(m => m.AdminPage) },
    { path: 'acesso-restrito', loadComponent: () => import('./app/admin-denied').then(m => m.AdminDeniedPage) },
    { path: 'produto/:id', loadComponent: () => import('./app/product-detail').then(m => m.ProductDetailPage) },
    { path: 'catalogo', loadComponent: () => import('./app/shop').then(m => m.CatalogPage) },
    { path: 'login', loadComponent: () => import('./app/login').then(m => m.LoginPage) },
    { path: 'finalizar-compra/:productId', loadComponent: () => import('./app/shop').then(m => m.CartPage) },
    { path: 'carrinho', loadComponent: () => import('./app/shop').then(m => m.CartPage) },
    { path: 'pagamento/:id', canActivate: [authGuard], loadComponent: () => import('./app/payment').then(m => m.PaymentPage) },
    { path: 'pedidos', canActivate: [authGuard], loadComponent: () => import('./app/orders').then(m => m.OrdersPage) },
    { path: 'pedidos/:id', canActivate: [authGuard], loadComponent: () => import('./app/orders').then(m => m.OrderDetailPage) },
    { path: 'dispositivos', canActivate: [authGuard], loadComponent: () => import('./app/workspace').then(m => m.DevicesPage) },
    { path: 'projetos', canActivate: [authGuard], loadComponent: () => import('./app/workspace').then(m => m.ProjectsPage) },
    { path: '', pathMatch: 'full', redirectTo: 'catalogo' }, { path: '**', redirectTo: 'catalogo' },
  ]),
] }).catch(console.error);
