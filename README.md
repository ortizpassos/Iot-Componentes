# IoT Platform

Projeto inicial para uma plataforma de venda, gerenciamento e programação de dispositivos IoT.

## Stack

- Node.js
- TypeScript
- NestJS
- MongoDB
- Mongoose
- JWT / Passport
- Docker Compose (MongoDB)
- Angular: catálogo e área do cliente em `frontend`

## Abrir no VS Code

Abra a pasta `iot-platform` no VS Code.

## Subir o MongoDB

Com Docker instalado:

```bash
docker compose up -d
```

## Backend

```bash
cd backend
npm install
```

Copie `.env.example` para `.env`:

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Linux/macOS:

```bash
cp .env.example .env
```

Depois:

```bash
npm run start:dev
```

API:

`http://localhost:3000/api`

Health check:

`GET http://localhost:3000/api/health`

## Frontend Angular

Em outro terminal, a partir da raiz do projeto:

```powershell
cd frontend
npm install
npm start
```

Abra `http://localhost:4200`. O frontend encaminha `/api` ao backend na porta 3000.
Inclui cadastro/login, catálogo, carrinho, pedidos, dispositivos e projetos.
Veja [instruções do frontend](frontend/README.md) para testes e publicação.

Área administrativa: acesso direto a `http://localhost:4200/adm`, sem link no menu, restrito às contas previamente autorizadas. Veja [como conceder acesso e gerenciar a loja](backend/src/admin/README.md).

Pagamentos: pedidos sem programação seguem para Pix ou cartão em `/pagamento/:id`. Configure as credenciais e o webhook conforme [integração Mercado Pago](backend/src/payments/README.md).

## Rotas da API

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/users/me`
- `GET /api/devices`
- `POST /api/devices`
- `GET /api/devices/:id`
- `DELETE /api/devices/:id`
- `GET /api/projects`
- `POST /api/projects`
- `GET /api/projects/:id`
- `DELETE /api/projects/:id`
- `POST /api/products`
- `GET /api/products`
- `GET /api/products/:id`
- `POST /api/orders`
- `GET /api/orders`
- `GET /api/orders/:id`

As rotas de usuários, dispositivos, projetos e pedidos exigem Bearer Token.
O cadastro de produtos e todas as rotas `/api/admin/*` exigem uma conta ADMIN ativa.

## Exemplo de cadastro

```json
{
  "name": "Cliente Teste",
  "email": "cliente@example.com",
  "password": "12345678"
}
```

## Exemplo de dispositivo

```json
{
  "name": "ESP32 Sala",
  "board": "ESP32",
  "model": "ESP32-S3",
  "serialNumber": "IOT-000001",
  "hardware": {
    "relay": { "gpio": 26 },
    "pir": { "gpio": 27 }
  }
}
```

## Exemplo de projeto

```json
{
  "name": "Iluminação automática",
  "description": "Aciona o relé ao detectar movimento",
  "deviceId": "ID_DO_DEVICE",
  "source": "MANUAL",
  "configuration": {
    "relay": { "gpio": 26 },
    "pir": { "gpio": 27 },
    "timeoutSeconds": 30
  }
}
```

## Próximos módulos previstos

- Firmwares
- Firmware Versions
- Support
- AI
- Web Flasher / Web Serial
- Payments
