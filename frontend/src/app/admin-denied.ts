import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

@Component({ imports: [RouterLink], template: `
  <section class="panel empty"><h1>{{ unavailable ? 'Não foi possível verificar o acesso' : 'Acesso restrito' }}</h1>
  <p>{{ unavailable ? 'A API está indisponível. Tente novamente em instantes.' : 'Sua conta não tem autorização para acessar esta área.' }}</p>
  @if (unavailable) { <a class="button primary" routerLink="/adm">Tentar novamente</a> }
  <a class="back-link" routerLink="/catalogo">Voltar ao catálogo</a></section>
` })
export class AdminDeniedPage { unavailable = inject(ActivatedRoute).snapshot.queryParamMap.has('unavailable'); }
