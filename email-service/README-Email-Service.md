# Serviço de e-mail — IoT Componentes

Este serviço consome eventos do backend pelo RabbitMQ, envia mensagens por SMTP e registra cada tentativa no mesmo MongoDB da API, na coleção `email_logs` do banco `iot_platform`.

## Eventos

- `customer.registered`: boas-vindas após o cadastro.
- `order.paid`: confirmação de pagamento e liberação de projetos digitais no Meu Lab.
- `order.shipped`: aviso de envio com código e link de rastreamento dos Correios.

O backend publica no exchange `iot-componentes.exchange` com a routing key `email.outbox`. A fila durável também se chama `email.outbox`. Os nomes podem ser alterados com `EMAIL_EXCHANGE` e `EMAIL_ROUTING_KEY` nos dois serviços.

Falhas no RabbitMQ ou SMTP não cancelam cadastro, pagamento ou envio. O envio é processado separadamente e o resultado fica em `email_logs`.

## Execução local

Copie as variáveis de `backend/.env.email.example` para o `.env` da raiz usado pelo Docker Compose e adicione `RABBITMQ_URL=amqp://guest:guest@localhost:5672` ao `backend/.env`. Depois execute:

```bash
docker compose up -d --build mongodb rabbitmq email-service
```

O backend pode continuar rodando diretamente na máquina. O painel RabbitMQ fica em `http://localhost:15672` com usuário e senha `guest` no ambiente local.

## Variáveis

- `RABBITMQ_URL`
- `MONGODB_URI` apontando para o mesmo banco `iot_platform` usado pela API
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `MAIL_FROM`
- `EMAIL_LOG_TOKEN`

Para Gmail, use uma senha de app no `SMTP_PASSWORD`; não use a senha normal da conta.

## Logs

`GET /api/email-logs` exige o cabeçalho `X-Email-Log-Token` com o valor de `EMAIL_LOG_TOKEN`. O endpoint nunca deve ficar configurado com token vazio em produção.

## Render

O `render.yaml` contém o worker `iot-componentes-email`. Configure nele a mesma `MONGODB_URI` da API e, no backend e no worker, a mesma URL de um RabbitMQ externo. Configure também as credenciais SMTP no worker.
