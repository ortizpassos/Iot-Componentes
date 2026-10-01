# Products

Módulo registrado no AppModule, com persistência no MongoDB.

- `POST /api/products`: cadastra produto; SKU duplicado retorna 409.
- `GET /api/products`: lista produtos ativos, ordenados por nome.
- `GET /api/products/:id`: consulta por ID, inclusive inativos; ID inválido retorna 400 e produto ausente retorna 404.
- `POST /api/shipping/quote`: calcula PAC e SEDEX pela SuperFrete usando o CEP do remetente configurado e o CEP de destino. Cada produto precisa ter peso e dimensões cadastrados. Configure `SUPERFRETE_TOKEN`; use `https://sandbox.superfrete.com` em `SUPERFRETE_BASE_URL` para homologação.

Consultas públicas; cadastro exige Bearer Token de uma conta ADMIN ativa. A gestão de produtos, incluindo inativos, está disponível em `/adm` e `/api/admin/products`.

Preço deve ser não negativo, estoque deve ser inteiro não negativo e o nome não pode estar vazio. O SKU é opcional no cadastro; quando omitido, a API gera um identificador no formato `TIPO-000001`, mantendo a sequência por tipo. SKUs informados manualmente continuam sendo aceitos e devem ser únicos. `weightGrams`, `lengthCm`, `widthCm` e `heightCm` são usados pela cotação da SuperFrete. `programming` aceita `supported` (boolean), `platform` e `chip` (strings). `specifications` aceita um objeto livre.

Use `../../products.http` no REST Client do VS Code ou copie o JSON para Postman/Insomnia. Inicie a API com `npm run start:dev` dentro de `backend`.

Próxima etapa: pedidos com snapshot de SKU, nome e preço unitário, quantidade e total, e solicitação de programação (`NONE`, `STANDARD`, `AI`, `CUSTOM`, requisitos e projectId). Alterações no catálogo não devem modificar pedidos existentes.
