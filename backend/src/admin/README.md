# Administração da loja

Abra diretamente `http://localhost:4200/adm` ou faça login com uma conta ADMIN para entrar automaticamente. O painel tem layout exclusivo e navegação própria. Não há link administrativo no catálogo público. Contas sem permissão recebem acesso restrito.

## Autorizar contas predeterminadas

O cadastro público sempre cria CUSTOMER. Nenhum e-mail, senha padrão ou primeiro usuário é promovido automaticamente. O operador pode autorizar contas pelo terminal, e administradores podem criar novas contas na guia Administradores. A guia Clientes lista apenas CUSTOMER; nao ha promocao de clientes pelo painel.

Dentro de `backend`, com o MongoDB configurado em `.env`:

```powershell
npm run admin:access -- grant usuario@exemplo.com
npm run admin:access -- revoke usuario@exemplo.com
```

O comando opera por e-mail exato e não cria contas nem altera senhas. POST /api/admin/administrators cria novas contas ADMIN, protegido pelos guards administrativos. Nao ha rota de promocao de clientes. Para trocar administradores, conceda acesso à nova conta antes de revogar a anterior. A API verifica o perfil e o estado ativo no banco a cada requisição autenticada, inclusive com JWTs emitidos antes da mudança.

## Gestão disponível

- Resumo de produtos, pedidos pendentes, contas, dispositivos e projetos.
- Produtos: listar ativos/inativos, criar, editar dados, preço, estoque, especificações e programação; ativar/desativar e excluir após confirmação.
- Configurações do site: nome da loja, frase do cabeçalho, título/descrição do catálogo e banner, aviso e e-mail de contato; persistidas no MongoDB e exibidas na loja pública.
- Pedidos: listar todos, consultar comprador e itens; pagamento confirmado -> PAID -> LABEL_ISSUED -> SHIPPED. O envio exige rastreio e confirmacao manual. Atualizacoes concorrentes geram 409.

### Etiqueta de envio

Em pedidos pagos, **Emitir etiqueta** coloca o pedido pago na fila do ESP32. O status permanece PAID ate a impressora aceitar o trabalho; entao muda para LABEL_ISSUED. O Monitor_impressora automatiza a impressao de pagamentos aprovados pelo Mercado Pago. Depois de despachar, **Informar rastreio e enviar** solicita o codigo e confirmacao em modal; POST /api/admin/orders/:id/ship registra trackingCode e shippedAt. GET /api/admin/orders/:id/shipping-label baixa novamente a etiqueta emitida. Veja [configuracao do monitor](../../../Monitor_impressora/README.md).

A etiqueta ocupa a metade superior de uma folha A4; a declaracao de conteudo segue abaixo e segue o arquivo `modelo-gerador-de-etiquetas-dos-correios.jpg` da raiz: quadros separados de DESTINATÁRIO e REMETENTE, nomes em negrito, endereço, CEP e código de barras Code 128 do CEP do destinatário. O número do pedido fica nos metadados e no nome do PDF. O CPF é validado no cadastro, mas não impresso externamente na embalagem. Pedidos antigos sem dados completos são bloqueados e permanecem pagos; o sistema não substitui silenciosamente o endereço pelo perfil atual. Pedidos antigos `FULFILLED` continuam como concluídos, sem migração automática.

Configure o remetente em **ADM → Configurações do site → Remetente das etiquetas** e clique em **Salvar dados do remetente**. Complemento é opcional; os outros campos são obrigatórios. Os dados são persistidos no banco, separados das configurações públicas, por `GET/PUT /api/settings/shipping-sender` (somente administradores ativos). Não é necessário configurar variáveis de ambiente nem reiniciar o backend ao alterar o remetente. Sem remetente completo, o envio é bloqueado antes da alteração de status. Novos envios guardam uma cópia do remetente no pedido para reimpressões consistentes. Pedidos enviados antes dessa configuração usam o remetente atual ao reimprimir. O código de barras identifica o CEP, não representa rastreamento ou contratação de frete dos Correios.

É uma etiqueta de identificação do destinatário; não contrata frete, não gera rastreamento ou comprovante de postagem. Endpoints exclusivos de administradores ativos e resposta PDF com `Cache-Control: no-store`. Testes: `npm run test:shipping`.
- Clientes: listar, buscar e ativar/desativar contas não administrativas. Desativação impede login e uso de tokens anteriores; hashes de senha nunca são retornados.
- Dispositivos: listar, criar para um cliente ativo e editar identificação/hardware. Proprietário não pode ser transferido por edição.
- Projetos: listar, criar, editar configuração/status e arquivar; dispositivo vinculado deve pertencer ao mesmo cliente.
- Listas com pesquisa literal e paginação de 20 registros (máximo 100 via API).

Clientes podem ser desativados. Produtos podem ser desativados ou excluídos; os pedidos preservam os snapshots de nomes e valores. Pedidos com tentativa de pagamento online têm aprovação/cancelamento sincronizados pelo Mercado Pago: faça os estornos e cancelamentos no painel do provedor. A finalização logística continua manual. Pedidos sem tentativa online mantêm os controles manuais. Essas ações não movimentam estoque nem executam firmware. Veja [pagamentos](../payments/README.md).

## API

Todas as rotas `/api/admin/*` exigem JWT e perfil ADMIN ativo. O antigo `POST /api/products` também passou a exigir ADMIN. Consultas públicas do catálogo continuam disponíveis.

- `GET /api/admin/access`, `GET /api/admin/summary`
- `GET|POST /api/admin/products`, `PUT /api/admin/products/:id`, `PATCH /api/admin/products/:id/active`
- `DELETE /api/admin/products/:id`
- `POST /api/admin/product-images` (multipart, campo `image`, ADMIN, até 5 MB, JPG/PNG/WebP)
- `GET /api/product-images/:filename` (público)
- `GET /api/settings` (público), `PUT /api/settings` (ADMIN)
- `GET /api/admin/orders`, `GET /api/admin/orders/:id`, `PATCH /api/admin/orders/:id/status`
- `GET /api/admin/users`, `PATCH /api/admin/users/:id/active`
- `GET|POST /api/admin/devices`, `PUT /api/admin/devices/:id`
- `GET|POST /api/admin/projects`, `PUT /api/admin/projects/:id`

As rotas PUT recebem os campos do formulário completo; não aceitam metadados arbitrários, perfil ou senhas. PATCH de ativação recebe `{ "active": true }`; PATCH de pedido recebe `{ "status": "PAID" }`.

Produtos aceitam `imageUrl`: link HTTP/HTTPS ou caminho retornado pelo upload (`/api/product-images/...`). Envie uma string vazia para remover a imagem do produto. URLs com credenciais e protocolos como `data:`, `file:` ou `javascript:` são rejeitadas. Links externos são carregados pelo navegador, não pelo servidor.

O upload valida o tipo pelo conteúdo do arquivo e usa nome UUID gerado pelo servidor. O nome original não determina o caminho nem a extensão. As imagens ficam em `backend/uploads/products`, devem ser preservadas entre deploys e são retornadas com MIME de imagem e `nosniff`. A remoção do vínculo não exclui o arquivo físico; não há limpeza automática de arquivos sem referência nesta etapa.

## Verificação

`npm run test:admin` compila e verifica autorização por HTTP com usuários simulados, revogação de perfil, bloqueio de contas, status de pedidos, consultas sem senha e vínculos de proprietários. Os testes Angular em `frontend/tests/admin.spec.ts` cobrem acesso direto, ausência de links públicos, cadastro/edição de produtos e confirmação de status com API simulada.

Referências: [autorização NestJS](https://docs.nestjs.com/security/authorization), [guards Angular](https://angular.dev/guide/routing/route-guards).
