import { AfterViewInit, Component, ElementRef, HostListener, OnDestroy, ViewChild, signal } from '@angular/core';

@Component({
  selector: 'app-sidebar',
  template: `<dialog #panel aria-label="Menu lateral" (click)="onClick($event)" (close)="onClose()">
    <button class="sidebar-close" type="button" aria-label="Fechar menu" (click)="close()">✕</button>
    <ng-content />
  </dialog>`,
  styles: `:host{display:contents}dialog{display:contents}.sidebar-close{display:none}
    @media(max-width:700px){
      dialog{display:none;position:fixed;inset:0 auto 0 0;margin:0;padding:0;border:0;width:min(300px,85vw);max-width:none;height:100dvh;max-height:none;background:#14263c;color:#dce5ef;overflow-y:auto}
      dialog[open]{display:block;animation:slide-in .2s ease-out}
      dialog::backdrop{background:#07132399}
      .sidebar-close{display:block;position:absolute;right:10px;top:10px;z-index:40;background:#314a65;color:white;border:0;width:40px;height:40px;padding:0}
      @keyframes slide-in{from{transform:translateX(-100%)}to{transform:translateX(0)}}
    }
    @media(prefers-reduced-motion:reduce){dialog[open]{animation:none}}`,
})
export class Sidebar implements AfterViewInit, OnDestroy {
  @ViewChild('panel', { static: true }) panel!: ElementRef<HTMLDialogElement>;
  opened = signal(false);
  private trigger: HTMLElement | null = null;
  private media = window.matchMedia('(max-width:700px)');
  private resize = () => {
    this.close();
    if (!this.media.matches) this.panel.nativeElement.show();
  };
  ngAfterViewInit() { this.resize(); this.media.addEventListener('change', this.resize); }
  ngOnDestroy() { this.media.removeEventListener('change', this.resize); }
  open(event: Event) { if (this.media.matches) { this.trigger = event.currentTarget as HTMLElement; this.panel.nativeElement.showModal(); this.opened.set(true); } }
  close() { this.panel.nativeElement.close(); this.opened.set(false); }
  onClose() { this.opened.set(false); if (this.media.matches) this.trigger?.focus(); }
  onClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    const rect = this.panel.nativeElement.getBoundingClientRect();
    const outside = event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
    if (this.media.matches && (outside || target.closest('a, nav button'))) this.close();
  }
  @HostListener('document:keydown.escape') escape() { if (this.media.matches) this.close(); }
}
