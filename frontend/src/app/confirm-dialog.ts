import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild, input, output } from '@angular/core';

@Component({ selector: 'app-confirm-dialog', template: `
  <dialog #dialog aria-labelledby="confirmation-title" aria-describedby="confirmation-message" [attr.aria-busy]="busy()" (cancel)="cancel($event)">
    <h2 id="confirmation-title">{{ destructive() ? 'Confirmar exclusão' : 'Confirmar ação' }}</h2>
    <p id="confirmation-message">{{ message() }}</p>
    @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
    @if (busy()) { <p role="status">Processando solicitação…</p> }
    <div class="dialog-actions">
      <button type="button" autofocus [disabled]="busy()" (click)="cancelled.emit()">Cancelar</button>
      <button type="button" class="primary" [class.destructive]="destructive()" [disabled]="busy()" (click)="confirmed.emit()">Confirmar alteração</button>
    </div>
  </dialog>
`, styles: `dialog{width:min(480px,calc(100vw - 32px));max-height:calc(100dvh - 32px);overflow-y:auto;border:1px solid var(--border);border-radius:14px;padding:28px;color:#20334a;background:white;box-shadow:0 24px 80px #14263c40}dialog::backdrop{background:rgba(12,25,42,.65)}h2{margin:0 0 16px}p{overflow-wrap:anywhere}.dialog-actions{display:flex;justify-content:flex-end;gap:12px;margin-top:24px;flex-wrap:wrap}.destructive{background:#a13232;border-color:#a13232}@media(max-width:480px){dialog{padding:22px}.dialog-actions button{flex:1}}` })
export class ConfirmDialog implements AfterViewInit, OnDestroy {
  message = input.required<string>(); busy = input(false); error = input(''); destructive = input(false);
  confirmed = output<void>(); cancelled = output<void>();
  @ViewChild('dialog', { static: true }) dialog!: ElementRef<HTMLDialogElement>;
  ngAfterViewInit() { this.dialog.nativeElement.showModal(); }
  ngOnDestroy() { this.dialog.nativeElement.close(); }
  cancel(event: Event) { event.preventDefault(); if (!this.busy()) this.cancelled.emit(); }
}
