#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>

#include <ArduinoJson.h>
#include <Preferences.h>
#include <time.h>
#include "config.h"
#ifndef ALLOW_LOCAL_HTTP
#define ALLOW_LOCAL_HTTP 0
#endif

Preferences journal;
String jobId, jobToken;
String receipt;

bool apiBegin(HTTPClient& http, WiFiClientSecure& tls, WiFiClient& plain, const String& path) {
  if (strlen(MONITOR_TOKEN) < 32) return false;
  String base(API_BASE);
  bool local = false;
  if (base.startsWith("http://")) {
    String host = base.substring(7); int slash = host.indexOf('/'); if (slash >= 0) host = host.substring(0, slash);
    int colon = host.indexOf(':'); if (colon >= 0) host = host.substring(0, colon);
    IPAddress address;
    local = ALLOW_LOCAL_HTTP && address.fromString(host) && (address[0] == 10 || (address[0] == 192 && address[1] == 168) || (address[0] == 172 && address[1] >= 16 && address[1] <= 31));
    if (!local) return false;
  } else if (!base.startsWith("https://") || strlen(API_ROOT_CA) == 0) return false;
  if (!local) tls.setCACert(API_ROOT_CA);
  http.setTimeout(65000);
  http.useHTTP10(true);
  if (!(local ? http.begin(plain, base + path) : http.begin(tls, base + path))) return false;
  http.addHeader("X-Print-Token", MONITOR_TOKEN);
  http.addHeader("Content-Type", "application/json");
  return true;
}
int apiPost(const String& path, const String& body, String& response) {
  WiFiClientSecure tls; WiFiClient plain; HTTPClient http;
  if (!apiBegin(http, tls, plain, path)) return -1;
  int status = http.POST(body); response = http.getString(); http.end(); return status;
}
String tokenBody() { return String("{\"token\":\"") + jobToken + "\"}"; }

// ============================================================
// BUFFERS GLOBAIS
// ============================================================

uint8_t ippBuffer[512];

uint8_t streamBuffer[2048];


// ============================================================
// IPP
// ============================================================

void put8(size_t& p, uint8_t v) {
  ippBuffer[p++] = v;
}

void put16(size_t& p, uint16_t v) {
  ippBuffer[p++] = (v >> 8) & 0xFF;
  ippBuffer[p++] = v & 0xFF;
}

void put32(size_t& p, uint32_t v) {
  ippBuffer[p++] = (v >> 24) & 0xFF;
  ippBuffer[p++] = (v >> 16) & 0xFF;
  ippBuffer[p++] = (v >> 8) & 0xFF;
  ippBuffer[p++] = v & 0xFF;
}


void addAttribute(
  size_t& p,
  uint8_t tag,
  const char* name,
  const char* value
) {
  uint16_t nameLen = strlen(name);
  uint16_t valueLen = strlen(value);

  put8(p, tag);

  put16(p, nameLen);

  memcpy(
    ippBuffer + p,
    name,
    nameLen
  );

  p += nameLen;

  put16(p, valueLen);

  memcpy(
    ippBuffer + p,
    value,
    valueLen
  );

  p += valueLen;
}


// ============================================================
// CRIAR PRINT-JOB
// ============================================================

size_t criarPrintJob() {
  size_t p = 0;

  // IPP 2.0
  put8(p, 0x02);
  put8(p, 0x00);

  // Print-Job = 0x0002
  put16(p, 0x0002);

  // request-id = 1
  put32(p, 1);

  // operation-attributes-tag
  put8(p, 0x01);

  addAttribute(
    p,
    0x47,
    "attributes-charset",
    "utf-8"
  );

  addAttribute(
    p,
    0x48,
    "attributes-natural-language",
    "en"
  );

  addAttribute(
    p,
    0x45,
    "printer-uri",
    (String("ipps://") + PRINTER_HOST + ":" + PRINTER_PORT + PRINTER_PATH).c_str()
  );

  addAttribute(
    p,
    0x42,
    "requesting-user-name",
    "esp32"
  );

  addAttribute(
    p,
    0x42,
    "job-name",
    "Etiqueta ESP32"
  );

  addAttribute(
    p,
    0x49,
    "document-format",
    "image/pwg-raster"
  );

  // end-of-attributes
  put8(p, 0x03);

  return p;
}


// ============================================================
// WIFI
// ============================================================

void conectarWiFi() {
  WiFi.mode(WIFI_STA);

  WiFi.begin(
    WIFI_SSID,
    WIFI_PASSWORD
  );

  Serial.print("WiFi");

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println();

  Serial.print("IP ESP32: ");
  Serial.println(WiFi.localIP());

  Serial.print("RSSI: ");
  Serial.print(WiFi.RSSI());
  Serial.println(" dBm");
}


// ============================================================
// ESCREVER TUDO NA IMPRESSORA
// ============================================================

bool escreverTudo(
  WiFiClientSecure& printer,
  const uint8_t* data,
  size_t len
) {
  size_t total = 0;

  unsigned long ultimoProgresso = millis();

  while (total < len) {
    size_t escrito = printer.write(
      data + total,
      len - total
    );

    if (escrito > 0) {
      total += escrito;
      ultimoProgresso = millis();
    }
    else {
      if (millis() - ultimoProgresso > 15000) {
        return false;
      }

      delay(1);
    }
  }

  return true;
}


// ============================================================
// IMPRESSAO
// ============================================================

bool imprimir() {
  Serial.println();
  Serial.println("========================================");
  Serial.println("1 - ABRINDO PWG NA API");
  Serial.println("========================================");

  WiFiClientSecure apiTls;
  WiFiClient apiPlain;
  HTTPClient http;
  if (!apiBegin(http, apiTls, apiPlain, "/" + jobId + "/data")) {
    Serial.println("ERRO: http.begin");
    return false;
  }

  int statusHTTP = http.POST(tokenBody());

  Serial.print("HTTP API: ");
  Serial.println(statusHTTP);

  if (statusHTTP != 200) {
    Serial.println("API nao retornou 200.");
    http.end();
    return false;
  }

  int tamanhoPWG = http.getSize();

  Serial.print("Tamanho PWG: ");
  Serial.println(tamanhoPWG);

  if (tamanhoPWG <= 0) {
    Serial.println(
      "ERRO: tamanho PWG desconhecido/invalido."
    );

    http.end();
    return false;
  }

  WiFiClient* apiStream =
    http.getStreamPtr();


  // ==========================================================
  // Verificacao inicial RaS2
  // ==========================================================

  Serial.println();
  Serial.println("Verificando assinatura PWG...");

  unsigned long inicio = millis();

  while (
    apiStream->available() < 4 &&
    millis() - inicio < 5000
  ) {
    delay(1);
  }

  if (apiStream->available() < 4) {
    Serial.println(
      "ERRO: nao foi possivel ler PWG."
    );

    http.end();
    return false;
  }

  uint8_t assinatura[4];

  size_t assinaturaLida =
    apiStream->readBytes(
      assinatura,
      4
    );

  if (assinaturaLida != 4) {
    Serial.println("ERRO lendo assinatura.");
    http.end();
    return false;
  }

  Serial.printf(
    "Assinatura: %02X %02X %02X %02X\n",
    assinatura[0],
    assinatura[1],
    assinatura[2],
    assinatura[3]
  );

  if (
    assinatura[0] != 0x52 ||
    assinatura[1] != 0x61 ||
    assinatura[2] != 0x53 ||
    assinatura[3] != 0x32
  ) {
    Serial.println(
      "ERRO: arquivo nao parece PWG Raster."
    );

    http.end();
    return false;
  }

  Serial.println("PWG RaS2 confirmado!");


  // ==========================================================
  // Criar IPP
  // ==========================================================

  size_t ippLen = criarPrintJob();

  size_t corpoTotal =
    ippLen +
    tamanhoPWG;

  Serial.println();
  Serial.print("Cabecalho IPP: ");
  Serial.println(ippLen);

  Serial.print("Corpo HTTP total: ");
  Serial.println(corpoTotal);

  Serial.printf(
    "Heap antes TLS: %u\n",
    ESP.getFreeHeap()
  );


  // ==========================================================
  // TLS Epson
  // ==========================================================

  Serial.println();
  Serial.println("========================================");
  Serial.println("2 - CONECTANDO NA EPSON");
  Serial.println("========================================");

  WiFiClientSecure printer;

  printer.setInsecure();
  printer.setTimeout(15000);

  Serial.println(
    "Conectando 192.168.100.22:631..."
  );

  if (!printer.connect(
        PRINTER_HOST,
        PRINTER_PORT
      )) {
    Serial.println(
      "ERRO: conexao TLS falhou."
    );

    http.end();
    return false;
  }

  Serial.println("TLS CONECTADO!");

  Serial.printf(
    "Heap depois TLS: %u\n",
    ESP.getFreeHeap()
  );


  // ==========================================================
  // HTTP para Epson
  // ==========================================================

  Serial.println();
  Serial.println("Enviando requisicao IPP...");

  journal.putString("receipt", "error");
  String startResponse;
  if (apiPost("/" + jobId + "/start", tokenBody(), startResponse) != 201) {
    printer.stop(); http.end(); return false;
  }

  printer.print("POST ");
  printer.print(PRINTER_PATH);
  printer.println(" HTTP/1.1");

  printer.print("Host: ");
  printer.print(PRINTER_HOST);
  printer.print(":");
  printer.println(PRINTER_PORT);

  printer.println(
    "Content-Type: application/ipp"
  );

  printer.print("Content-Length: ");
  printer.println(corpoTotal);

  printer.println("Connection: close");

  printer.println();


  // ==========================================================
  // Cabecalho IPP
  // ==========================================================

  if (!escreverTudo(
        printer,
        ippBuffer,
        ippLen
      )) {
    Serial.println(
      "ERRO enviando IPP."
    );

    printer.stop();
    http.end();

    return false;
  }

  Serial.println("Cabecalho IPP enviado.");


  // ==========================================================
  // IMPORTANTE:
  // Os 4 bytes RaS2 que consumimos precisam ser enviados.
  // ==========================================================

  if (!escreverTudo(
        printer,
        assinatura,
        4
      )) {
    Serial.println(
      "ERRO enviando assinatura PWG."
    );

    printer.stop();
    http.end();

    return false;
  }


  // ==========================================================
  // Streaming PWG
  // ==========================================================

  Serial.println();
  Serial.println("========================================");
  Serial.println("3 - STREAMING PWG");
  Serial.println("========================================");

  size_t totalPWG = 4;

  unsigned long ultimoDado =
    millis();

  unsigned long ultimoLog = 0;

  while (
    totalPWG <
    (size_t)tamanhoPWG
  ) {
    int disponivel =
      apiStream->available();

    if (disponivel > 0) {
      size_t restante =
        tamanhoPWG - totalPWG;

      size_t ler =
        disponivel;

      if (ler > sizeof(streamBuffer)) {
        ler = sizeof(streamBuffer);
      }

      if (ler > restante) {
        ler = restante;
      }

      size_t lidos =
        apiStream->readBytes(
          streamBuffer,
          ler
        );

      if (lidos > 0) {
        if (!escreverTudo(
              printer,
              streamBuffer,
              lidos
            )) {
          Serial.println();
          Serial.println(
            "ERRO enviando PWG para Epson."
          );

          printer.stop();
          http.end();

          return false;
        }

        totalPWG += lidos;

        ultimoDado = millis();

        // Não inundar o Serial
        if (
          millis() - ultimoLog >
          500
        ) {
          float percentual =
            (
              (float)totalPWG /
              (float)tamanhoPWG
            ) * 100.0;

          Serial.printf(
            "PWG: %u/%u (%.1f%%)\n",
            (unsigned int)totalPWG,
            tamanhoPWG,
            percentual
          );

          ultimoLog = millis();
        }
      }
    }
    else {
      if (
        millis() - ultimoDado >
        15000
      ) {
        Serial.println();
        Serial.println(
          "TIMEOUT recebendo API."
        );

        printer.stop();
        http.end();

        return false;
      }

      delay(1);
    }
  }


  Serial.println();
  Serial.println(
    "PWG ENVIADO COMPLETAMENTE!"
  );

  Serial.print("Total PWG: ");
  Serial.println(totalPWG);


  // ==========================================================
  // Resposta Epson
  // ==========================================================

  Serial.println();
  Serial.println("========================================");
  Serial.println("4 - RESPOSTA EPSON");
  Serial.println("========================================");

  unsigned long espera =
    millis();

  while (!printer.available()) {
    if (
      millis() - espera >
      30000
    ) {
      Serial.println(
        "TIMEOUT aguardando resposta IPP."
      );

      printer.stop();
      http.end();

      return false;
    }

    delay(10);
  }


  // ==========================================================
  // HTTP headers
  // ==========================================================

  int responseLength = -1;
  bool httpAccepted = false;
  bool chunked = false;
  unsigned long headerStart = millis();

  while (
    (printer.connected() || printer.available()) && millis() - headerStart < 15000
  ) {
    if (printer.available()) {
      String linha =
        printer.readStringUntil('\n');

      if (linha.startsWith("HTTP/1.")) httpAccepted = linha.substring(9, 12) == "200";
      String lower = linha; lower.toLowerCase();
      if (lower.indexOf("transfer-encoding: chunked") >= 0) chunked = true;
      Serial.print(linha);

      if (
        linha.startsWith("Content-Length:") ||
        linha.startsWith("content-length:")
      ) {
        int p =
          linha.indexOf(':');

        if (p >= 0) {
          responseLength =
            linha.substring(p + 1).toInt();
        }
      }

      if (linha == "\r") {
        break;
      }
    }
  }


  // ==========================================================
  // Primeiros 8 bytes da resposta IPP
  // ==========================================================

  if (!httpAccepted || chunked) { printer.stop(); http.end(); return false; }
  uint8_t resp[8];

  size_t recebidos = 0;

  unsigned long inicioResp =
    millis();

  while (
    recebidos < 8 &&
    millis() - inicioResp <
    5000
  ) {
    if (printer.available()) {
      resp[recebidos++] =
        printer.read();
    }
    else {
      delay(1);
    }
  }


  bool sucesso = false;

  if (recebidos == 8 && resp[4] == 0 && resp[5] == 0 && resp[6] == 0 && resp[7] == 1) {
    uint16_t ippStatus =
      ((uint16_t)resp[2] << 8) |
      resp[3];

    uint32_t responseId =
      ((uint32_t)resp[4] << 24) |
      ((uint32_t)resp[5] << 16) |
      ((uint32_t)resp[6] << 8) |
      resp[7];

    Serial.println();
    Serial.println(
      "=== RESULTADO IPP ==="
    );

    Serial.printf(
      "IPP version: %u.%u\n",
      resp[0],
      resp[1]
    );

    Serial.printf(
      "Status: 0x%04X\n",
      ippStatus
    );

    Serial.printf(
      "Request ID: %u\n",
      responseId
    );

    if (ippStatus <= 0x00FF) {
      sucesso = true;

      Serial.println();
      Serial.println(
        ">>> PRINT-JOB ACEITO PELA EPSON <<<"
      );
    }
    else {
      Serial.println();
      Serial.println(
        ">>> EPSON REJEITOU PRINT-JOB <<<"
      );
    }
  }
  else {
    Serial.println(
      "Resposta IPP incompleta."
    );
  }


  printer.stop();
  http.end();

  return sucesso;
}


// ============================================================
// SETUP
// ============================================================

void setup() {
  Serial.begin(115200);
  journal.begin("label-monitor", false);
  jobId = journal.getString("id", "");
  jobToken = journal.getString("token", "");
  // A reboot during printing is uncertain: report for review, never resend.
  receipt = journal.getString("receipt", "error");
  conectarWiFi();
  configTime(0, 0, "pool.ntp.org", "time.google.com");
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) { WiFi.reconnect(); delay(5000); return; }
  if (String(API_BASE).startsWith("https://") && time(nullptr) < 1700000000) { delay(1000); return; }
  String response;
  if (jobId.length()) {
    JsonDocument result; result["token"] = jobToken;
    result["result"] = receipt == "accepted" ? "accepted" : "error";
    result["message"] = receipt == "accepted" ? "IPP aceito pela impressora" : "Falha ou reinicio. Confira a impressora antes de tentar novamente.";
    String body; serializeJson(result, body);
    int status = apiPost("/" + jobId + "/result", body, response);
    if ((status >= 200 && status < 300) || status == 409) {
      journal.clear(); jobId = ""; jobToken = ""; receipt = "";
    }
    delay(5000); return;
  }
  int status = apiPost("/claim", "{}", response);
  if (status == 201 && response.length() && response != "null") {
    JsonDocument job;
    if (!deserializeJson(job, response) && job["id"].is<String>() && job["token"].is<String>()) {
      jobId = job["id"].as<String>(); jobToken = job["token"].as<String>();
      journal.putString("id", jobId); journal.putString("token", jobToken);
      journal.putString("receipt", "error");
      receipt = imprimir() ? "accepted" : "error";
      journal.putString("receipt", receipt);
    }
  }
  delay(15000);
}
