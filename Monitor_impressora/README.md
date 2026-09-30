# Monitor de etiquetas (ESP32 + Epson IPP)

Fluxo: pagamento Mercado Pago confirmado pela API -> PAID -> ESP32 consulta a fila a cada 15 segundos -> baixa etiqueta + declaracao A4 em PWG -> Epson aceita Print-Job -> LABEL_ISSUED (Etiqueta emitida). O ADM informa o codigo de rastreio e confirma manualmente SHIPPED (Enviado). A etiqueta emitida indica aceite do trabalho pela impressora, nao prova de que o papel saiu: confira papel/tinta antes do despacho.

## Configuracao

1. Publique o backend usando o Dockerfile de backend (CUPS/cupsfilter instalado). O render.yaml foi preparado para runtime Docker. Servicos Render existentes em Node precisam ser recriados/configurados como Docker; o codigo nao altera sozinho o servico publicado. Preserve todas as variaveis existentes e dados persistentes.
2. Configure PRINT_MONITOR_TOKEN no backend com um segredo aleatorio de pelo menos 32 caracteres. Gere localmente com node -e "console.log(require('crypto').randomBytes(32).toString('hex'))". Nunca coloque esse valor no Angular, Git ou URL.
3. Copie config.example.h para config.h se ele nao existir. O config.h local foi preservado com a rede do sketch original e esta ignorado pelo Git. Preencha MONITOR_TOKEN com o mesmo segredo, API_BASE com a API publicada e API_ROOT_CA com o certificado raiz PEM confiavel que valida o HTTPS da API. Nao use setInsecure para a API.
4. Ajuste PRINTER_HOST, PRINTER_PORT e PRINTER_PATH se necessario. O ESP32 e a Epson devem estar na mesma rede. A conexao IPPS local conserva o certificado autoassinado da Epson (setInsecure apenas para a impressora).
5. Na IDE Arduino, use o core ESP32 e ArduinoJson 7. Compile e grave Monitor_impressora.ino na placa correta. O relogio sincroniza por NTP antes de acessar HTTPS.
6. Cadastre o remetente em ADM -> Configuracoes. Ligue o monitor e teste com um pedido de homologacao aprovado e uma folha A4. No teste local, uma etiqueta ficticia foi enviada pelo ESP32 da COM3 e aceita pela Epson; a API registrou LABEL_ISSUED/DONE. Confira fisicamente a folha antes de usar em pedidos reais.

## Falhas e duplicatas

A reserva de cada pedido e atomica no MongoDB. Webhooks repetidos nao geram novos trabalhos. O ESP32 persiste o ID, token e resultado em Preferences/NVS. Se a confirmacao da API falhar, repete apenas o recibo, nunca o envio do PWG. Se a placa reiniciar com um trabalho em andamento, marca falha para revisao. Uma queda antes de persistir a reserva pode deixar CLAIMED na API; revise pelo ADM.

Em ADM -> Pedidos, a situacao da impressao e exibida (Reservada, Em impressao, Falha). Para tentar novamente, pare o monitor, verifique a fila da impressora e confirme que a etiqueta nao saiu; so entao use Revisar e tentar impressao novamente. Esse botao invalida a reserva antiga. Reinicie o monitor depois. Nao ha repeticao automatica de resultado incerto, pois IPP nao oferece garantia de exatamente uma impressao em quedas de energia.

O monitor so seleciona pedidos PAID cujo payment.status e approved. Pedidos com pagamento confirmado manualmente podem emitir PDF pelo ADM. Pedidos antigos pagos online tambem sao elegiveis se ainda nao tiveram uma tentativa. Pedidos ja enviados nao sao selecionados. Sem monitor conectado, os pedidos permanecem pagos aguardando impressao. Reembolsos/cancelamentos impedem iniciar trabalhos ainda nao enviados; nao retiram papel nem cancelam um trabalho que ja chegou a Epson.

## API e testes

Todas as rotas /api/print-monitor exigem X-Print-Token. POST /claim retorna id/token ou vazio; POST /:id/data recebe token e retorna PWG; POST /:id/start trava o envio; POST /:id/result recebe token, result (accepted/error) e message. Os tokens de trabalho nao sao expostos aos clientes nem na listagem ADM.

POST /api/admin/orders/:id/issue-label emite PDF manualmente; POST /:id/ship exige trackingCode e LABEL_ISSUED; POST /:id/retry-print exige ADM e revisao manual. Download de etiquetas emitidas continua em GET /:id/shipping-label. Nao ha alteracao automatica de estoque neste fluxo.

Validacao backend: npm run test:shipping e node --test test/print-monitor.test.cjs test/payments.test.cjs. Frontend: npm run test:e2e -- tests/shipping.spec.ts tests/admin.spec.ts.

Referencias: [CUPS cupsfilter](https://www.cups.org/doc/man-cupsfilter.html), [CUPS Raster](https://www.cups.org/doc/spec-raster.html), [ESP32 HTTPClient](https://github.com/espressif/arduino-esp32/blob/master/libraries/HTTPClient/src/HTTPClient.h).

## Teste local preparado neste computador

A API de teste usa http://192.168.100.4:3001 e o painel usa http://localhost:4201/adm. Acesse com admin@teste.local e senha TesteEtiqueta123! (conta ficticia exclusiva do banco isolado). O MongoDB de teste nao publica portas e utiliza volume proprio. Credenciais reais do Mercado Pago nao foram copiadas.

O config.h local ja tem ALLOW_LOCAL_HTTP=1, endereco local e token igual ao arquivo .print-test.env. HTTP so e aceito mediante essa opcao e com endereco IPv4 privado literal. Para producao, desative ALLOW_LOCAL_HTTP, restaure API_BASE HTTPS e configure API_ROOT_CA. O firmware nao usa o relogio NTP como requisito para HTTP local.

Para reiniciar a API e o banco de teste, na raiz:

    docker compose -f docker-compose.print-test.yml up -d --build

Para iniciar o painel, em frontend:

    npm exec -- ng serve --host 127.0.0.1 --port 4201 --proxy-config proxy.print-test.json

Pedido ficticio: 507f1f77bcf86cd799439092. Ele tem pagamento SIMULADO pela rotina interna de confirmacao, sem cobranca nem chamada ao Mercado Pago. O teste valida a fila, a geracao do arquivo, a impressao e o rastreio; nao valida recebimento de webhook externo.

Para preparar o pedido pela primeira vez (na raiz):

    Get-Content backend/scripts/seed-print-test.cjs -Raw | docker compose -f docker-compose.print-test.yml exec -T -w /app/scripts api node -

Executar novamente nao reimprime pedidos ja emitidos. O script recusa qualquer outro banco. O arquivo check-print-test.cjs verifica a API, PWG e proxy sem enviar a impressora; execute apenas com o monitor parado, pois reserva e libera um trabalho da fila.

Grave o firmware compilado no ESP32 correto, mantenha computador e impressora ligados na mesma rede e coloque papel A4. O pedido deve mudar para Etiqueta emitida; atualize a lista no ADM e use Informar rastreio e enviar com um codigo ficticio. Em caso de falha, revise o estado da impressora antes de reenfileirar. O Firewall do Windows precisa permitir entrada TCP 3001 a partir do ESP32; nenhuma regra foi aberta automaticamente.

Para parar os containers sem apagar dados:

    docker compose -f docker-compose.print-test.yml stop
