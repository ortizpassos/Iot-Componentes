import { Injectable, inject, signal } from '@angular/core';
import { Api } from './core';
export interface BannerSlide { title: string; description: string; imageUrl: string }
export const defaultStore = {
  storeName: 'IoT Componentes', tagline: 'Da ideia ao dispositivo.',
  catalogTitle: 'Componentes para suas ideias.', catalogDescription: 'Encontre a próxima peça do seu projeto.',
  bannerTitle: 'Pequenos componentes. Grandes possibilidades.', bannerDescription: 'Escolha sua placa e solicite a programação que o seu projeto precisa.',
  announcement: '', contactEmail: '',
  bannerSlides: [] as BannerSlide[], bannerInterval: 6,
};
export type StoreValues = typeof defaultStore;
@Injectable({ providedIn: 'root' })
export class StoreConfig {
  private api = inject(Api); value = signal<StoreValues>({ ...defaultStore });
  load() { this.api.get<StoreValues>('settings').subscribe({ next: value => this.value.set({ ...defaultStore, ...value, storeName: ['iot lab', 'iot componentes', 'iot components'].includes(value.storeName?.trim().toLowerCase()) ? defaultStore.storeName : value.storeName || defaultStore.storeName }), error: () => {} }); }
}
