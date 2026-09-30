# Mercado Pago: Pix e cartão

## Dados do comprador e cartão padrão

Antes de registrar qualquer pedido, o cliente deve salvar nome completo, CPF válido e endereço brasileiro completo (CEP, rua, número ou S/N, bairro, cidade e UF; complemento opcional). O carrinho carrega os dados nas compras seguintes e permite alterá-los. Os endpoints autenticados `GET/PUT /api/users/me/checkout-profile` usam exclusivamente o usuário da sessão. O cadastro inicial da conta continua simples.

Cada pedido guarda uma cópia dos dados de entrega. Alterar o perfil não altera pedidos anteriores. Pedidos antigos sem esses dados exigem o formulário antes de iniciar o pagamento. Dados de entrega aparecem nos detalhes do pedido do cliente e do administrador; CPF e referências de cartão não são incluídos na consulta genérica de usuários.

No pagamento com cartão, a opção de salvar como padrão começa desmarcada. Com consentimento, após o retorno aceito do pagamento, o backend associa o token ao Customer no Mercado Pago e guarda apenas ID do cartão, bandeira, quatro últimos dígitos e data. PAN, CVV e token temporário não são persistidos. Uma falha ao salvar o cartão não cancela nem repete a cobrança; a página mostra um aviso separado.

`GET /api/payments/saved-card` retorna somente o cartão do usuário autenticado. O Payment Brick recebe esse Customer e cartão e o apresenta como opção padrão na próxima compra, solicitando nova confirmação e tokenização pelo SDK. O backend obtém o Customer do banco, nunca aceita esse identificador do navegador. `DELETE /api/payments/saved-card` remove a preferência da loja; não exclui o cartão da conta Mercado Pago nem cancela pagamentos.

O salvamento depende da disponibilidade da API de Customers/Cards para as credenciais da loja. Em respostas de cobrança perdidas por falha de rede, a reconciliação confirma o pagamento, mas não tenta salvar novamente um token temporário. Não há cobrança recorrente ou automática. Testar a associação e reutilização em homologação antes de produção; os testes locais simulam o provedor.

Referências: [Salvar cartão](https://www.mercadopago.com.br/developers/pt/reference/online-payments/checkout-api/cards/save-card/post), [cartões salvos no Payment Brick](https://www.mercadopago.com.br/developers/pt/docs/checkout-bricks/payment-brick/advanced-features/customers-cards), [configuração do Payment Brick](https://github.com/mercadopago/sdk-js/blob/main/docs/bricks/payment-guest.md).

Execute `npm run test:checkout` para validar CPF/endereço, bloqueio de compra, cópia dos dados no pedido, consentimento e isolamento do cartão por cliente.

Pedidos sem programação seguem para `/pagamento/:id`. Pedidos com qualquer item STANDARD/AI/CUSTOM continuam no atendimento, sem cobrança online automática. Valores sempre vêm do snapshot do pedido no MongoDB.

## Configurar

Crie uma aplicação Mercado Pago compatível com Checkout Bricks/Payments API. Copie as variáveis de `backend/.env.payments.example` para `backend/.env` e preencha as credenciais da mesma aplicação:

- `MP_PUBLIC_KEY`: chave pública, usada pelo formulário Card Payment Brick.
- `MP_ACCESS_TOKEN`: segredo usado exclusivamente no backend.
- `MP_WEBHOOK_SECRET`: assinatura secreta da configuração de Webhooks.
- `MP_NOTIFICATION_URL`: URL HTTPS pública para `/api/payments/notifications/mercadopago`.

Nunca coloque o Access Token ou segredo do webhook nos arquivos Angular, no banco de configurações públicas ou no Git. Reinicie o backend após configurar. Sem as credenciais, o pedido é salvo, mas a página informa que o pagamento está indisponível.

No painel do Mercado Pago, habilite notificações **payment** para a URL acima. Localhost não recebe notificações externas; use uma URL HTTPS de homologação ou túnel seguro configurado pelo operador. A consulta autenticada do cliente também reconcilia o status enquanto a página estiver aberta.

Teste em ambiente de homologação com contas e cartões de teste oficiais. A disponibilidade e as regras de teste de Pix dependem da conta e da modalidade habilitada no Mercado Pago; não gere Pix real durante testes automatizados. Esta implementação utiliza `/v1/payments`, conforme o fluxo documentado de Checkout Bricks (não `/v1/orders`).

## Fluxo

- Pix: formulário coleta e-mail/CPF, backend cria pagamento e devolve QR Code, copia e cola e vencimento.
- Cartão: SDK oficial carrega apenas ao selecionar cartão; Card Payment Brick tokeniza os dados. O backend recebe token, bandeira, emissor, parcelas e identificação, nunca número do cartão ou CVV.
- Uma operação atômica no pedido impede solicitações simultâneas. Uma chave UUID de idempotência e uma referência externa vinculam a tentativa ao pedido.
- Tentativas pendentes ou com resultado de rede desconhecido bloqueiam novas cobranças. A API consulta o pagamento existente (ou busca pela referência externa) para recuperar resultados, inclusive após recarregar a página.
- Se uma falha de rede ocorrer antes de chegar ao provedor e a busca permanecer vazia, a tentativa fica bloqueada para conferência pelo operador. Não remova esse bloqueio sem verificar que não houve cobrança no Mercado Pago.
- Rejeição, cancelamento confirmado ou erro de validação 400/422 permitem nova tentativa. Não é possível trocar de método enquanto um Pix ou cartão está pendente; aguarde a conclusão ou cancele no Mercado Pago.
- Webhooks exigem assinatura HMAC válida e consultam o recurso no Mercado Pago antes de atualizar o banco. Valor, moeda e referência são conferidos. Apenas aprovação confirmada muda PENDING para PAID. Eventos antigos não sobrescrevem estados mais recentes; reembolso/chargeback integral marca CANCELLED.
- Alterações manuais de pagamento/cancelamento no ADM ficam bloqueadas para pedidos que já iniciaram uma tentativa online. A impressao automatica usa PAID com payment.status approved. A etiqueta aceita pela impressora muda para LABEL_ISSUED; o ADM confirma SHIPPED com rastreio apos o despacho. Faça cancelamentos/estornos no painel Mercado Pago; os eventos atualizam a loja.

## Limites desta etapa

O total é somente o dos produtos: frete, reserva/baixa automática de estoque e cobrança de programação não foram implementados. Não há fluxo próprio para reembolso parcial ou desafio 3DS; casos que permaneçam em análise/autorização devem ser acompanhados no Mercado Pago antes de liberar o pedido. Ative produção somente após validar as modalidades de cartão da sua conta e o fluxo de homologação.

## Testes

`npm run test:payments` no backend verifica isolamento por cliente, valores calculados no servidor, concorrência, recuperação de rede, assinatura, moeda e transições. `npm run test:e2e` no frontend cobre o redirecionamento sem programação, QR Code, retomada, aprovação e cartão com SDK/API simulados. Nenhum teste automatizado cria cobrança real.

Referências oficiais: [Pix](https://www.mercadopago.com.br/developers/pt/docs/checkout-bricks/payment-brick/payment-submission/pix), [Card Payment Brick](https://www.mercadopago.com.br/developers/pt/docs/checkout-bricks/card-payment-brick/payment-submission), [Webhooks](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro-preferences/additional-content/notifications/webhooks).
# Política de parcelamento por produto (preparação)

O cadastro aceita `installmentFeePayer`: `BUYER` (repassar custos) ou `SELLER` (loja assume). A política desejada é preservada em cada item do pedido. Este campo ainda não altera a cobrança no Mercado Pago e não habilita anúncio público de parcelas sem juros.

A integração atual usa Payment Brick e `/v1/payments`. `maxInstallments` limita a quantidade de parcelas, mas não define o responsável pelos juros. A ativação da política por produto depende de definir uma integração compatível com as condições da conta Mercado Pago, incluindo o tratamento de pedidos com políticas diferentes. Não enviar `installments_cost` da API Point para `/v1/payments`.

Referências: [parcelamento no Brick](https://www.mercadopago.com.br/developers/pt/docs/checkout-bricks/card-payment-brick/advanced-features/configure-installments), [configuração de parcelas na conta](https://www.mercadopago.com.br/blog/oferecer-pagamentos-12x-sem-acrescimos-mercado-pago).

