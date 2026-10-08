# Orders

Pedidos vinculados ao cliente autenticado via JWT.

- `POST /api/orders`: cria um pedido PENDING.
- `GET /api/orders`: lista somente os pedidos do cliente, mais recentes primeiro.
- `GET /api/orders/:id`: retorna o pedido do cliente; ausente ou de outro cliente retorna 404.

Envie apenas `items`, contendo `productId`, `quantity` (inteiro de 1 a 10000) e, opcionalmente, `programmingRequest`. São aceitos até 100 produtos distintos por pedido. Produtos inativos são rejeitados.

A API consulta o catálogo e salva um snapshot de productId, SKU, nome, quantidade, preço unitário e total. Os cálculos usam centavos inteiros; valores retornados são em reais. Consultas não repopulam preços a partir do catálogo, preservando o histórico.

Sem solicitação de programação, o item recebe `requested: false` e `type: NONE`. Para solicitar, use `requested: true` e `STANDARD`, `AI` ou `CUSTOM`; AI e CUSTOM exigem `requirements`. O produto deve ter `programming.supported: true`. `projectId` está reservado no schema para vínculo posterior controlado pelo servidor e não é aceito do cliente.

A criação reserva atomicamente as unidades por 5 minutos e baixa o estoque disponível. Se o pagamento não for confirmado nesse prazo, o pedido fica CANCELLED e as unidades retornam ao estoque. A reserva não adiciona taxa de programação nem cria projetos ou dispositivos automaticamente. O total contempla somente os produtos. Pedidos sem programação podem ser pagos via [Mercado Pago](../payments/README.md); somente confirmação pelo provedor muda automaticamente o status para PAID. Não há endpoint público para alterar status.

Exemplos: `backend/orders.http`. Execute `npm run test:orders` dentro de backend para compilar e verificar snapshots, totais, validação e isolamento por cliente com persistência simulada.
