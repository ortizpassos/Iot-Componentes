import { CartPersistence } from './app/cart-persistence';
import { ApiKeepAlive } from './app/api-keep-alive';
import { Sidebar } from './app/sidebar';
import { FormsModule } from '@angular/forms';
import { CATALOG_CATEGORIES } from './app/catalog-categories';
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
  selector: 'app-root', imports: [Sidebar, FormsModule, RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    @if (adminLayout()) { <router-outlet /> } @else {
    <header class="topbar"><button class="mobile-menu-button" type="button" aria-label="Abrir menu" [attr.aria-expanded]="sidebar.opened()" (click)="sidebar.open($event)">☰</button><a class="brand" routerLink="/catalogo"><span class="brand-icon">⌘</span>{{ store.value().storeName }}</a><form class="navbar-search" role="search" (ngSubmit)="searchCatalog()"><label class="sr-only" for="navbar-search">Buscar produtos</label><input id="navbar-search" name="search" [(ngModel)]="searchTerm" placeholder="Buscar produtos, marcas e modelos..." maxlength="200"><button type="submit" aria-label="Buscar"><svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg></button></form>@if (session.token()) { <span class="tagline navbar-user" [title]="session.user()?.name || 'Minha conta'">{{ session.user()?.name || 'Minha conta' }}</span> }
      <div class="account">@if (session.user()?.role !== 'ADMIN') { <a class="orders-link" routerLink="/pedidos">Meus pedidos</a> }<a class="cart-link" routerLink="/carrinho" [attr.aria-label]="'Carrinho, ' + cart.totalQuantity() + ' itens'" title="Abrir carrinho"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 3h3l3 12h11l3-9H6"/><circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/></svg><span class="cart-count" aria-hidden="true">{{ cart.totalQuantity() }}</span></a>@if (session.token()) { <button class="text-button" [disabled]="cartPersistence.loggingOut()" (click)="logout()">{{ cartPersistence.loggingOut() ? 'Salvando...' : 'Sair' }}</button>@if (cartPersistence.logoutError()) { <span role="alert">{{ cartPersistence.logoutError() }}</span> } } @else { <a routerLink="/login">Entrar / Cadastrar</a> }</div>
      <nav class="category-nav" aria-label="Categorias de produtos">@for (category of categories; track category.value) { <a routerLink="/catalogo" [queryParams]="{ categoria: category.value || null, busca: searchTerm || null }" [class.selected]="catalogActive() && selectedCategory() === category.value" [attr.aria-current]="catalogActive() && selectedCategory() === category.value ? 'page' : null">{{ category.label }}</a> }</nav>
    </header>
    <div class="layout"><app-sidebar #sidebar><aside><div class="nav-label">WORKSPACE</div><nav aria-label="Navegação principal">
      <a routerLink="/catalogo" routerLinkActive="active">◈ <span>Catálogo</span></a>
      @if (session.user()?.role === 'ADMIN') { <a routerLink="/adm" routerLinkActive="active">⚙ <span>Painel administrativo</span></a> }
      <a routerLink="/carrinho" routerLinkActive="active">▤ <span>Carrinho</span><small>{{ cart.totalQuantity() }}</small></a>
      <a routerLink="/pedidos" routerLinkActive="active">▦ <span>Meus pedidos</span></a>
      <a routerLink="/dispositivos" routerLinkActive="active">▣ <span>Dispositivos</span></a>
      <a routerLink="/projetos" routerLinkActive="active">◇ <span>Projetos</span></a>
      <a routerLink="/meu-lab" routerLinkActive="active">⚗ <span>Meu Lab</span></a>
    </nav><div class="sidebar-note"><span class="dot"></span> Seu próximo projeto<br>começa com uma ideia.</div></aside></app-sidebar><main id="main"><router-outlet /></main></div>
    }
  `,
})
class App {
  cartPersistence = inject(CartPersistence);
  private keepAlive = inject(ApiKeepAlive);
  searchTerm = '';
  searchCatalog() { void this.router.navigate(['/catalogo'], { queryParams: { busca: this.searchTerm.trim() || null, categoria: this.selectedCategory() || null } }); }
  categories = CATALOG_CATEGORIES; selectedCategory = signal(''); catalogActive = signal(false);
  session = inject(Session); cart = inject(Cart); private router = inject(Router); private api = inject(Api);
  store = inject(StoreConfig); adminLayout = signal(false);
  constructor() {
    this.router.events.pipe(takeUntilDestroyed()).subscribe(event => { if (event instanceof NavigationEnd) { const path = event.urlAfterRedirects.split('?')[0]; this.adminLayout.set(path === '/adm'); this.catalogActive.set(path === '/catalogo'); this.searchTerm = this.router.parseUrl(event.urlAfterRedirects).queryParams['busca'] || ''; const value = this.router.parseUrl(event.urlAfterRedirects).queryParams['categoria'] || ''; this.selectedCategory.set(this.categories.some(category => category.value === value) ? value : ''); } });
    this.store.load();
    if (this.session.token()) this.api.get<User>('users/me').subscribe({ next: user => this.session.user.set(user), error: () => {} });
  }
  async logout() { if (await this.cartPersistence.logout()) void this.router.navigate(['/login']); }
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
    { path: 'projetos/:id', canActivate: [authGuard], canDeactivate: [(component: { flashing: () => boolean }) => !component.flashing()], loadComponent: () => import('./app/store-projects').then(m => m.StoreProjectPage) },
    { path: 'meu-lab', canActivate: [authGuard], canDeactivate: [(component: { flashing: () => boolean }) => !component.flashing()], loadComponent: () => import('./app/my-lab').then(m => m.MyLabPage) },
    { path: 'projetos', canActivate: [authGuard], loadComponent: () => import('./app/store-projects').then(m => m.StoreProjectsPage) },
    { path: '', pathMatch: 'full', redirectTo: 'catalogo' }, { path: '**', redirectTo: 'catalogo' },
  ]),
] }).catch(console.error);
