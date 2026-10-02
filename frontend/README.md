# Frontend

Aplicação Angular 21 standalone com catálogo, cadastro/login, carrinho, pedidos, dispositivos e projetos. Interface em português e responsiva.

## Executar

Requer Node 22.12+ (linha 22) e backend em `http://localhost:3000`.

```powershell
cd frontend
npm install
npm start
```

Abra `http://localhost:4200`. O proxy de desenvolvimento em `proxy.conf.json` encaminha `/api/**` ao NestJS. Execute o backend em outro terminal com `cd backend` e `npm run start:dev`.

```powershell
npm run build
npm run test:e2e
```

Os testes de navegador usam Microsoft Edge instalado e respostas simuladas da API; verificam login/checkout, payload de pedidos, sessão expirada, recuperação de erro e layout móvel. Não substituem testes integrados com MongoDB.
Os cenários administrativos também verificam bloqueio de clientes comuns, ausência de links públicos, edição de produtos e confirmação de status. O servidor de testes usa a porta 4301, sem reutilizar o servidor de desenvolvimento da porta 4200.

## Comportamento

- O JWT fica em sessionStorage, limitado à sessão da aba; logout e HTTP 401 limpam sessão e carrinho. Apenas chamadas à API recebem o token.
- O carrinho fica em memória e é perdido ao recarregar a página. Login pela própria aplicação preserva os itens.
- O checkout envia somente IDs, quantidades e solicitação de programação. Preços e totais são determinados pelo backend. Pedidos sem programação abrem `/pagamento/:id` para Pix ou cartão via Mercado Pago; pedidos com programação seguem para atendimento. Veja [configuração de pagamentos](../backend/src/payments/README.md). Não há reserva automática de estoque.
- Dispositivos e projetos podem ser listados e cadastrados. Não há edição, exclusão ou gravação de firmware nesta interface.
- O catálogo é público; pedidos, dispositivos e projetos exigem login.
- O login de uma conta ADMIN abre `/adm` automaticamente. O painel tem layout e navegação próprios, com produtos, pedidos, clientes, dispositivos, projetos e configurações do site. A navegação pública não mostra links administrativos. O backend autoriza apenas contas ADMIN ativas. Veja [gestão e concessão de acesso](../backend/src/admin/README.md).

## Publicação

### Render

O `render.yaml` da raiz inclui a API (Web Service) e o frontend (Static Site). A página `/adm` deve ser aberta no endereço do **frontend**; o backend serve somente `/api/*`.

Para um Static Site criado manualmente, configure:

- Root Directory: `frontend`
- Build Command: `npm ci && npm run build`
- Publish Directory: `dist/web/browser`
- Redirects/Rewrites: Source `/*`, Destination `/index.html`, Action **Rewrite**.

A regra permite abrir `/adm` diretamente e atualizar a página sem receber 404. Alterar o YAML local não atualiza serviços criados manualmente; nesses casos, aplique a regra no painel do Render. Referência: [rewrites no Render](https://render.com/docs/redirects-rewrites).

O frontend publicado usa a API `https://iot-componentes-bo23.onrender.com/api`, definida em `src/app/core.ts`. Se o backend tiver outro endereço, atualize essa constante antes de compilar e publicar.

Se a página abrir, mas mostrar **Acesso restrito**, verifique a permissão da conta no banco usado pela API publicada. O cadastro público cria contas CUSTOMER; para autorizar uma conta existente, execute no backend conectado ao mesmo MongoDB `npm run admin:access -- grant usuario@exemplo.com`. A permissão concedida no banco local não se transfere automaticamente para o Atlas.

Se a API estiver indisponível, confira os logs do backend e a variável `MONGODB_URI` no Render. O marcador `<db_password>` da URI do Atlas precisa ser substituído pela senha real (com caracteres especiais codificados na URL); mantenha também o nome do banco correto no caminho da URI. Não coloque essa credencial no frontend nem no repositório.

Para cadastrar componentes: entre em `/adm`, abra **Produtos** e clique em **Cadastrar componente**. Informe nome, tipo, descrição, preço em reais e estoque. O SKU é opcional e será gerado automaticamente pelo backend quando ficar vazio. Mantenha **Produto ativo no catálogo** marcado para exibir o item na loja. Os mesmos dados podem ser alterados no botão **Editar**; especificações avançadas são opcionais.

Em **Imagem do componente**, use **Enviar imagem** (JPG, PNG ou WebP de até 5 MB) ou preencha **Link da imagem** com uma URL HTTP/HTTPS direta. Confira a prévia e clique em **Salvar**. Na edição, é possível substituir ou remover a imagem. Se um link deixar de funcionar, o catálogo exibe um marcador de imagem indisponível. Links externos dependem do servidor de origem; prefira HTTPS quando a loja estiver publicada em HTTPS.

Os arquivos enviados ficam em `backend/uploads/products`, fora do Git, e são servidos por `/api/product-images/:filename`. Preserve essa pasta em backups e use armazenamento persistente na publicação. Substituir/remover uma imagem do produto não apaga o arquivo físico, pois ele pode ser usado por outro produto; uploads de formulários cancelados também são mantidos. O upload requer ADMIN e o acesso às imagens do catálogo é público.

**Excluir** remove o produto após confirmação, preservando os snapshots dos pedidos. Em **Configurações do site**, publique nome da loja, frase do cabeçalho, textos do catálogo/banner, aviso aos clientes e e-mail de contato. **Visualizar loja** abre a interface pública; as configurações persistem no MongoDB e são carregadas novamente ao atualizar a página.

Sirva `dist/web/browser` com fallback para `index.html` nas rotas da aplicação. Configure um reverse proxy para `/api` apontando ao backend; o proxy do Angular funciona apenas em desenvolvimento. Nunca inclua credenciais do MongoDB ou segredo JWT no frontend.

Referências: [compatibilidade Angular](https://angular.dev/reference/versions) e [interceptores HTTP](https://angular.dev/guide/http/interceptors).

### API keep-alive

O frontend consulta `GET /api/health` ao abrir e a cada 5 minutos, usando a mesma URL base da API. A chamada dispensa token, ignora erros e tem timeout de 90 segundos, sem alterar a sessao ou o carrinho. Nao ha chamadas simultaneas de health na mesma instancia da aplicacao.

Funciona somente enquanto a pagina estiver aberta e o navegador executar seus timers; abas suspensas ou dispositivos em repouso podem interromper as chamadas. Para manter o servico ativo sem visitantes, configure um monitor externo ou um plano sempre ativo. Referencia: https://render.com/docs/free#spinning-down-on-idle

### Embalagens para envio

No ADM, abra **Embalagens** para cadastrar ou editar nome, comprimento, largura e altura (cm). No cadastro de produtos físicos, selecione a embalagem e informe o peso do item (g). Serviços não exigem esses campos.

As próximas cotações de frete usam as medidas atuais da embalagem. Produtos antigos conservam suas medidas anteriores até que uma embalagem seja selecionada ao editá-los. Publique backend e frontend juntos para disponibilizar esse cadastro.

### Carrinhos abandonados

O carrinho de visitantes fica salvo neste navegador. Após o login, os itens são unidos ao carrinho da conta e sincronizados com a API. A recuperação consulta preços e estoque atuais; produtos inativos ou sem estoque são removidos. Sair da conta oculta os itens neste navegador, preservando o carrinho na conta.

Em **ADM > Carrinhos abandonados**, aparecem carrinhos identificados com itens e sem alterações há 30 minutos. O total é uma estimativa sem frete. Carrinhos esvaziados deixam a lista; após registrar a compra, o pedido sem pagamento aparece na mesma guia. Depois de pago, fica na guia Pedidos. Não há envio automático de mensagens nesta funcionalidade. Publique backend e frontend juntos.

No ADM, **Carrinhos abandonados** também mostra imediatamente os pedidos registrados com status pendente de pagamento. A guia **Pedidos** lista somente pagos, etiquetas emitidas, enviados e concluídos. Pedidos cancelados não entram nessas listas. A confirmação manual de pagamento permanece disponível na lista de pedidos sem pagamento.

### Projetos prontos para venda

Cadastro no ADM, compras digital/completa, arquivos protegidos e gravação USB pelo navegador: consulte [o guia de projetos](../docs/projetos-prontos.md).
