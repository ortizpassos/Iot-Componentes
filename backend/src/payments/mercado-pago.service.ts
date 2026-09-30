import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface ProviderPayment {
  status_detail?: string;
  id: number | string; status: string; external_reference: string; currency_id: string;
  transaction_amount: number; date_last_updated?: string; date_of_expiration?: string;
  payment_method_id?: string; point_of_interaction?: { transaction_data?: { qr_code?: string; qr_code_base64?: string } };
}
export interface ProviderCard { id: string; last_four_digits: string; payment_method: { id: string }; }
export class ProviderError extends Error { constructor(public readonly status: number) { super('Mercado Pago indisponível.'); } }
@Injectable()
export class MercadoPagoService {
  constructor(private readonly config: ConfigService) {}
  configuration() {
    return { enabled: !!this.config.get<string>('MP_ACCESS_TOKEN') && !!this.config.get<string>('MP_PUBLIC_KEY'), publicKey: this.config.get<string>('MP_PUBLIC_KEY') || '' };
  }
  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = this.config.get<string>('MP_ACCESS_TOKEN');
    if (!token) throw new ServiceUnavailableException('Pagamento ainda não configurado pela loja.');
    let response: Response;
    try { response = await fetch(`https://api.mercadopago.com${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init.headers }, signal: AbortSignal.timeout(10000) }); }
    catch { throw new ProviderError(503); }
    if (!response.ok) throw new ProviderError(response.status);
    try { return await response.json() as T; } catch { throw new ProviderError(503); }
  }
  create(body: object, key: string) { return this.request<ProviderPayment>('/v1/payments', { method: 'POST', headers: { 'X-Idempotency-Key': key }, body: JSON.stringify(body) }); }
  createCustomer(email: string, reference: string) {
    return this.request<{ id: string }>('/v1/customers', { method: 'POST', headers: { 'X-Idempotency-Key': reference }, body: JSON.stringify({ email, description: reference }) });
  }
  saveCard(customerId: string, token: string) {
    return this.request<ProviderCard>(`/v1/customers/${encodeURIComponent(customerId)}/cards`, { method: 'POST', body: JSON.stringify({ token }) });
  }
  get(id: string) { return this.request<ProviderPayment>(`/v1/payments/${encodeURIComponent(id)}`); }
  cancel(id: string) { return this.request<ProviderPayment>(`/v1/payments/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify({ status: 'cancelled' }) }); }
  async search(reference: string) {
    const result = await this.request<{ results: ProviderPayment[] }>(`/v1/payments/search?external_reference=${encodeURIComponent(reference)}&sort=date_created&criteria=desc&limit=10`);
    return result.results.filter(p => p.external_reference === reference);
  }
}
