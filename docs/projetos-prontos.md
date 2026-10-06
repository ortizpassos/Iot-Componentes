# Projetos prontos para venda

## Cadastro no ADM

Abra **Projetos > Cadastrar projeto**. Informe nome, descrição pública, instruções e a categoria Grátis ou Pago. O preço digital é solicitado apenas para projetos pagos. Para oferecer o dispositivo já gravado, habilite a opção completa e informe preço, estoque e peso. A embalagem é escolhida automaticamente pelo peso total dos itens.

Envie até cinco imagens (JPG/PNG/WebP, 5 MB cada), dez PDFs (10 MB cada) e os arquivos BIN (10 MB cada). O link de vídeo é opcional. Imagens e vídeo fazem parte do anúncio; instruções, PDFs e BINs exigem compra nos projetos pagos e login nos gratuitos publicados.

Cadastre um firmware para cada modelo de placa compatível, indicando a família do chip. O nome deve identificar também as características relevantes (memória, PSRAM, pinagem). Famílias iniciais: ESP32, ESP32-S2, ESP32-S3, ESP32-C3 e ESP32-C6.

- **MERGED:** um BIN completo, contendo bootloader, tabela de partições e aplicação, gravado a partir do endereço 0.
- **PARTS:** envie todos os BINs necessários e os endereços produzidos pela compilação. O formulário usa endereços decimais: 0x1000 = 4096; 0x8000 = 32768; 0x10000 = 65536. Esses exemplos não substituem os endereços corretos do seu build.

Não use apenas o BIN da aplicação como firmware completo. O site não compila código-fonte e não converte firmware entre modelos. Exporte e teste o firmware para cada placa oferecida antes de publicar. Consulte a [documentação oficial merge-bin](https://docs.espressif.com/projects/esptool/en/latest/esp32/esptool/basic-commands.html).

Desmarcar a publicação impede novas compras; compradores existentes continuam com acesso. Os projetos pessoais antigos ficam preservados no banco, mas não se transformam automaticamente em projetos comerciais. Clientes não podem criar ou excluir projetos.

## Compra e liberação

A página **Projetos** separa o catálogo em Grátis e Pagos. O **Meu Lab** mostra os gratuitos publicados automaticamente e os pagos adquiridos, em seções separadas. Ao clicar em **Abrir no Meu Lab**, as instruções, PDFs, vídeo e gravador abrem na mesma página. O cliente escolhe a oferta na página de detalhes. As compras digitais pagas e de dispositivos completos utilizam o fluxo existente de pedidos e Mercado Pago. Projetos gratuitos dispensam checkout.

A compra digital dispensa frete e etiqueta. A completa exige frete e segue o fluxo de impressão/envio. O cadastro do comprador continua sendo solicitado pelo checkout e pelo pagamento.

Nos projetos pagos, o acesso é verificado na API a cada consulta/download, a partir dos itens registrados no pedido e do cliente autenticado. Pedidos pendentes ou cancelados não liberam arquivos. Pagamentos confirmados manualmente no ADM também liberam o projeto. Estornos que cancelam o pedido removem esse acesso, salvo se houver outra compra válida do mesmo projeto.

## Gravação no navegador

Use Chrome ou Edge no computador, por HTTPS (ou localhost). Conecte um cabo USB de dados e feche outros programas que usam a porta serial. Selecione o modelo cadastrado, clique **Conectar e gravar projeto**, confirme a substituição do programa e escolha a porta COM.

O site verifica SHA-256 dos downloads, família do chip conectado, cabeçalho do firmware e capacidade da flash. A biblioteca esptool-js grava e verifica o resultado com MD5. Mantenha a página e o cabo conectados. Em placas sem reset automático, mantenha BOOT pressionado durante a conexão, conforme as instruções do modelo.

A gravação é feita no dispositivo conectado ao computador do cliente, mediante permissão do navegador. Não é uma atualização OTA de dispositivos distantes. [Web Serial e esptool-js](https://espressif.github.io/esptool-js/docs/index.html).

## Publicação e verificação

Publique backend e frontend juntos. Os arquivos desta funcionalidade ficam em documentos binários no MongoDB; não dependem do disco temporário do Render. Não é necessária nova variável de ambiente.

Testes automatizados: backend/test/project-store.test.cjs, frontend/tests/project-store.spec.ts e frontend/tests/project-flasher.test.cjs. Os testes do gravador usam transporte simulado; a validação final exige uma placa e um firmware real de teste. Não foi gravado nenhum dispositivo durante a implementação.

## Se a gravação parar em Connecting

A etapa de conexão USB ocorre depois do download e da verificação dos BINs. Feche o Monitor Serial, outras abas de gravação e a IDE que estiver usando a porta. Se o reset automático falhar, marque **Conexão manual com BOOT/EN**. Segure BOOT, pressione e solte EN/RESET e solte BOOT; depois conecte pela página. Consulte também as instruções específicas da placa e a [documentação da Espressif](https://docs.espressif.com/projects/esptool/en/latest/esp32/advanced-topics/boot-mode-selection.html).

Um HTTP 401 indica autenticação recusada pela API. Se ocorrer ao baixar o firmware, a porta não será aberta e a página retornará ao login, preservando o endereço do projeto. Se vier de uma requisição em segundo plano durante a gravação, o retorno ao login aguarda a liberação da porta. Para diagnosticar, confira a URL da requisição no Network; não compartilhe o token de autorização.

Projetos grátis publicados liberam os arquivos para clientes autenticados sem pedido ou pagamento. Rascunhos e projetos excluídos não são liberados gratuitamente. Projetos pagos continuam exigindo compra confirmada; compradores anteriores mantêm acesso mesmo após despublicação/exclusão. A oferta de dispositivo completo de um projeto grátis continua paga. Projetos antigos permanecem como pagos até que o ADM altere sua categoria.
