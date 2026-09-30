#pragma once
const char* WIFI_SSID = "SUA_REDE";
const char* WIFI_PASSWORD = "SUA_SENHA";
const char* API_BASE = "https://iot-componentes-bo23.onrender.com/api/print-monitor";
const char* MONITOR_TOKEN = ""; // Same PRINT_MONITOR_TOKEN as API, at least 32 characters.
const char* API_ROOT_CA = ""; // Trusted PEM root CA for API TLS, required.
const char* PRINTER_HOST = "192.168.100.22";
const uint16_t PRINTER_PORT = 631;
const char* PRINTER_PATH = "/ipp/print";

// Set to 1 only for private IPv4 HTTP on an isolated local test.
#define ALLOW_LOCAL_HTTP 0
