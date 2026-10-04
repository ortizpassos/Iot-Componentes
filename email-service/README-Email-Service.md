
# Email Service - BridgeFlow

Este microserviço é responsável por consumir mensagens do RabbitMQ e enviar e-mails automáticos para usuários do sistema BridgeFlow. Também registra logs de envio em um banco PostgreSQL e expõe um endpoint para consulta dos e-mails enviados.

## Visão Geral
- **Linguagem:** Java 17, Spring Boot 3.2
- **Mensageria:** RabbitMQ (consome fila `email.outbox`)
- **Persistência:** PostgreSQL (`email_logs`)
- **Envio de e-mail:** SMTP (configurável via variáveis de ambiente)
- **API REST:** Consulta de logs de e-mail enviados
- **Execução:** Dockerfile e docker-compose

## Estrutura de Pastas
```
email-service/
├── Dockerfile
├── pom.xml
├── src/
│   ├── main/java/com/monitorellas/
│   │   ├── config/         # Configuração RabbitMQ
│   │   ├── mail/           # Envio e log de e-mails
│   │   ├── mq/             # Listener RabbitMQ
│   │   └── EmailServiceApplication.java
│   └── main/resources/
│       └── application.yml
└── target/
```

## Componentes Principais
- **RabbitConfig:** Define exchange, fila e binding para integração com o backend.
- **EmailListener:** Consome mensagens da fila, interpreta o tipo (`type`) e dispara o e-mail correspondente:
  - `email.verificacao`: e-mail de ativação de conta
  - `comunicado.criado`: comunicado novo
  - `decisao.criada`: decisão atribuída
  - `notificacao.manual`: notificação customizada
- **MailService:** Envia e-mails via SMTP e registra o resultado (sucesso/erro) em `EmailLog`.
- **EmailLog:** Entidade JPA para persistir logs de envio.
- **EmailLogRepository:** Interface Spring Data para acesso aos logs.
- **EmailLogController:** Endpoint REST para consulta dos e-mails enviados (`GET /api/email-logs`).

## Configurações
- **application.yml:**
  - RabbitMQ: host, porta, credenciais
  - PostgreSQL: url, usuário, senha
  - SMTP: host, porta, usuário, senha, remetente
- **Variáveis de ambiente:**
  - `RABBITMQ_HOST`, `RABBITMQ_PORT`, `RABBITMQ_USER`, `RABBITMQ_PASS`
  - `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`
  - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `MAIL_FROM`

## Fluxo de Funcionamento
1. Backend publica mensagem JSON no RabbitMQ (exchange `bridgeflow.exchange`, routing key `bridgeflow.routingkey`).
2. EmailListener consome da fila `email.outbox` e identifica o tipo de evento.
3. MailService monta o e-mail (assunto, corpo, destinatário) e envia via SMTP.
4. Resultado do envio (sucesso/erro) é registrado em `email_logs`.
5. Logs podem ser consultados via API REST (`GET /api/email-logs`).

## Exemplos de Payloads RabbitMQ
- **Verificação de e-mail:**
```json
{
  "type": "email.verificacao",
  "usuarioEmail": "usuario@exemplo.com",
  "codigo": "123456",
  "expiresAt": "PT30M"
}
```
- **Comunicado criado:**
```json
{
  "type": "comunicado.criado",
  "emailNotificacao": "destino@exemplo.com",
  "comunicadoTitulo": "Aviso Importante",
  "comunicadoConteudo": "Conteúdo do comunicado",
  "remetente": "Secretaria A",
  "destinatario": "Secretaria B",
  "comunicadoPrioridade": "URGENTE"
}
```
- **Decisão criada:**
```json
{
  "type": "decisao.criada",
  "emailNotificacao": "responsavel@exemplo.com",
  "decisaoTitulo": "Tomar providência",
  "responsavelNome": "João Silva",
  "prazo": "2025-12-10T23:59:00"
}
```
- **Notificação manual:**
```json
{
  "type": "notificacao.manual",
  "emailNotificacao": "usuario@exemplo.com",
  "titulo": "Alerta",
  "mensagem": "Mensagem personalizada",
  "destinatario": "Maria"
}
```

## Execução Local
### Requisitos
- Java 17+
- Maven 3.9+
- RabbitMQ e PostgreSQL ativos

### Build e Run
```bash
cd email-service
mvn clean package
java -jar target/email-service-0.0.1.jar
```

### Docker Compose
O serviço pode ser iniciado junto ao backend e dependências:
```bash
docker compose up -d --build email-service
```

## API REST
| Método | Rota | Descrição |
| ------ | ---- | --------- |
| GET    | /api/email-logs | Lista todos os logs de e-mail enviados |

## Sugestões de Evolução
- Adicionar testes automatizados para envio e log de e-mails
- Implementar retries para falhas de envio
- Permitir consulta filtrada por destinatário, sucesso/erro, datas
- Externalizar configurações sensíveis para Secret Manager
- Adicionar suporte a templates de e-mail

---
Dúvidas ou sugestões? Abra uma issue no repositório BridgeFlow_Project.
