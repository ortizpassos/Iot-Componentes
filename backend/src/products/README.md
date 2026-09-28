# Products

Módulo registrado no AppModule, com persistência no MongoDB.

- `POST /api/products`: cadastra produto; SKU duplicado retorna 409.
- `GET /api/products`: lista produtos ativos, ordenados por nome.
- `GET /api/products/:id`: consulta por ID, inclusive inativos; ID inválido retorna 400 e produto ausente retorna 404.

Consultas públicas; cadastro exige Bearer Token de uma conta ADMIN ativa. A gestão de produtos, incluindo inativos, está disponível em `/adm` e `/api/admin/products`.

Preço deve ser não negativo, estoque deve ser inteiro não negativo e nome/SKU não podem estar vazios. `programming` aceita `supported` (boolean), `platform` e `chip` (strings). `specifications` aceita um objeto livre.

Use `../../products.http` no REST Client do VS Code ou copie o JSON para Postman/Insomnia. Inicie a API com `npm run start:dev` dentro de `backend`.

Próxima etapa: pedidos com snapshot de SKU, nome e preço unitário, quantidade e total, e solicitação de programação (`NONE`, `STANDARD`, `AI`, `CUSTOM`, requisitos e projectId). Alterações no catálogo não devem modificar pedidos existentes.
