import { Injectable, inject } from '@angular/core';
import { HttpBackend, HttpClient } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EMPTY, catchError, exhaustMap, timer, timeout } from 'rxjs';
import { resolveApiUrl } from './core';

@Injectable({ providedIn: 'root' })
export class ApiKeepAlive {
  // Bypass authentication interceptors: health failures must never clear a session.
  private http = new HttpClient(inject(HttpBackend));

  constructor() {
    timer(0, 5 * 60 * 1000).pipe(
      exhaustMap(() => this.http.get(resolveApiUrl('/api/health')).pipe(
        timeout(90_000),
        catchError(() => EMPTY),
      )),
      takeUntilDestroyed(),
    ).subscribe();
  }
}
