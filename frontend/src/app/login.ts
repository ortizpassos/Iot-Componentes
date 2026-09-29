import { Component, inject, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Api, Session, User, errorMessage } from './core';

@Component({ standalone: true, imports: [FormsModule], template: `
  <div class="auth-layout"><div><p class="eyebrow">CONECTE SUAS IDEIAS</p><h1>Um lugar para<br>criar o próximo.</h1><p class="subtitle">Componentes, dispositivos e projetos.<br>Tudo conectado à sua conta.</p><div class="circuit-art" aria-hidden="true">⌘</div></div>
  <section class="panel auth-panel"><h2>{{ register() ? 'Crie sua conta' : 'Bem-vindo de volta' }}</h2><p class="muted">{{ register() ? 'Comece a construir com o IoT Componentes.' : 'Entre para acompanhar seus projetos.' }}</p>
    @if (expired) { <p class="notice">Sua sessão expirou. Entre novamente.</p> }
    @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
    <form #form="ngForm" (ngSubmit)="submit(form)">
      @if (register()) { <label>Nome<input name="name" [(ngModel)]="name" required minlength="2" autocomplete="name"></label> }
      <label>E-mail<input name="email" [(ngModel)]="email" required email type="email" autocomplete="email"></label>
      <label>Senha<input name="password" [(ngModel)]="password" required [minlength]="register() ? 8 : 1" type="password" [autocomplete]="register() ? 'new-password' : 'current-password'"></label>
      @if (register()) { <small class="muted">Use pelo menos 8 caracteres.</small> }
      <button class="primary full" [disabled]="busy() || form.invalid">{{ busy() ? 'Aguarde…' : register() ? 'Criar conta' : 'Entrar' }}</button>
    </form><button class="text-button full" [disabled]="busy()" (click)="register.set(!register()); error.set('')">{{ register() ? 'Já tenho uma conta' : 'Ainda não tenho conta' }}</button>
  </section></div>
` })
export class LoginPage {
  private api = inject(Api); private session = inject(Session); private router = inject(Router); private route = inject(ActivatedRoute);
  register = signal(false); busy = signal(false); error = signal(''); name = ''; email = ''; password = '';
  expired = this.route.snapshot.queryParamMap.has('expired');
  submit(form: NgForm) {
    if (form.invalid || this.busy()) return;
    this.busy.set(true); this.error.set('');
    const body = this.register() ? { name: this.name.trim(), email: this.email.trim(), password: this.password } : { email: this.email.trim(), password: this.password };
    this.api.post<{ accessToken: string; user: User }>(`auth/${this.register() ? 'register' : 'login'}`, body).subscribe({
      next: result => { this.session.set(result.accessToken, result.user); const fallback = result.user.role === 'ADMIN' ? '/adm' : '/catalogo'; const path = result.user.role === 'ADMIN' ? '/adm' : this.route.snapshot.queryParamMap.get('returnUrl') || fallback; void this.router.navigateByUrl(path.startsWith('/') && !path.startsWith('//') && !path.startsWith('/login') ? path : fallback); },
      error: error => { this.error.set(errorMessage(error)); this.busy.set(false); },
    });
  }
}
