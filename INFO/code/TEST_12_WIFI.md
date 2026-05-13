# TEST 12 — WiFi (Подключение к сети)

**Модуль:** Встроенный WiFi ESP32 (802.11 b/g/n)  
**Библиотека:** WiFi.h (встроена в Arduino ESP32 core)

**Что проверяет:**
- Подключение к WiFi сети
- Получение IP адреса
- Проверку силы сигнала (RSSI)
- Автоматическое переподключение при потере связи
- Сканирование доступных сетей

---

```cpp
/*
 * NEXIS TEST — WiFi
 * Подключение к WiFi + диагностика
 *
 * ← ИЗМЕНИТЬ: Введи свои данные WiFi ↓
 */

#include <WiFi.h>

#define WIFI_SSID      "Testardu"      // ← ИЗМЕНИТЬ: имя вашей WiFi сети
#define WIFI_PASSWORD  "12345678"      // ← ИЗМЕНИТЬ: пароль WiFi
#define TIMEOUT_MS     15000           // Таймаут подключения 15 секунд

void scanNetworks() {
  Serial.println("\n[Сканирование] Поиск WiFi сетей...");
  int n = WiFi.scanNetworks();

  if (n == 0) {
    Serial.println("  Сети не найдены!");
  } else {
    Serial.printf("  Найдено %d сетей:\n", n);
    for (int i = 0; i < n; i++) {
      Serial.printf("  %2d. %-32s  RSSI: %4d dBm  %s\n",
                    i + 1,
                    WiFi.SSID(i).c_str(),
                    WiFi.RSSI(i),
                    WiFi.encryptionType(i) == WIFI_AUTH_OPEN ? "[OPEN]" : "[SECURED]");
    }
  }
  WiFi.scanDelete();
}

bool connectWiFi() {
  Serial.printf("\n[WiFi] Подключение к: %s\n", WIFI_SSID);
  Serial.println("[WiFi] Пожалуйста, подождите...");

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  uint32_t start = millis();
  int dots = 0;

  while (WiFi.status() != WL_CONNECTED) {
    if (millis() - start > TIMEOUT_MS) {
      Serial.println("\n[WiFi] ТАЙМАУТ! Не удалось подключиться.");
      return false;
    }
    delay(500);
    Serial.print(".");
    if (++dots % 40 == 0) Serial.println();
  }

  Serial.println("\n[WiFi] ПОДКЛЮЧЕНО!");
  return true;
}

void printWiFiInfo() {
  Serial.println("─────────────────────────────");
  Serial.println("Информация о подключении:");
  Serial.printf("  SSID:        %s\n",   WiFi.SSID().c_str());
  Serial.printf("  IP адрес:    %s\n",   WiFi.localIP().toString().c_str());
  Serial.printf("  Маска:       %s\n",   WiFi.subnetMask().toString().c_str());
  Serial.printf("  Шлюз:        %s\n",   WiFi.gatewayIP().toString().c_str());
  Serial.printf("  DNS:         %s\n",   WiFi.dnsIP().toString().c_str());
  Serial.printf("  MAC адрес:   %s\n",   WiFi.macAddress().c_str());
  Serial.printf("  RSSI:        %d dBm\n", WiFi.RSSI());

  // Интерпретация уровня сигнала
  int rssi = WiFi.RSSI();
  if (rssi > -50) Serial.println("  Сигнал: Отличный");
  else if (rssi > -65) Serial.println("  Сигнал: Хороший");
  else if (rssi > -75) Serial.println("  Сигнал: Средний");
  else Serial.println("  Сигнал: Слабый (возможны разрывы)");

  Serial.println("─────────────────────────────");
  Serial.println("\nДля запуска NEXIS сервера:");
  Serial.printf("  SERVER_HOST = \"%s\"\n", WiFi.gatewayIP().toString().c_str());
  Serial.println("  (это обычно IP компьютера в той же сети)");
  Serial.println("  Узнать точный IP ПК: ipconfig (Windows) / ifconfig (Mac/Linux)");
}

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n=== NEXIS TEST: WiFi ===");

  // Сначала сканируем сети
  scanNetworks();

  // Подключаемся
  if (connectWiFi()) {
    printWiFiInfo();
  } else {
    Serial.println("\nВозможные причины:");
    Serial.println("  1. Неверное имя сети (WIFI_SSID)");
    Serial.println("  2. Неверный пароль (WIFI_PASSWORD)");
    Serial.println("  3. Роутер слишком далеко (слабый сигнал)");
    Serial.println("  4. Сеть 5GHz — ESP32 поддерживает только 2.4GHz!");
  }
}

void loop() {
  // Мониторинг подключения каждые 10 секунд
  static uint32_t lastCheck = 0;
  uint32_t now = millis();

  if (now - lastCheck > 10000) {
    lastCheck = now;

    if (WiFi.status() == WL_CONNECTED) {
      Serial.printf("[WiFi] Подключён | IP: %s | RSSI: %d dBm\n",
                    WiFi.localIP().toString().c_str(),
                    WiFi.RSSI());
    } else {
      Serial.println("[WiFi] Связь потеряна! Переподключаемся...");
      WiFi.reconnect();
      uint32_t t = millis();
      while (WiFi.status() != WL_CONNECTED && millis() - t < 8000) delay(500);

      if (WiFi.status() == WL_CONNECTED) {
        Serial.println("[WiFi] Восстановлено! IP: " + WiFi.localIP().toString());
      } else {
        Serial.println("[WiFi] Переподключение не удалось.");
      }
    }
  }

  delay(100);
}
```

---

**Ожидаемый вывод:**
```
=== NEXIS TEST: WiFi ===

[Сканирование] Поиск WiFi сетей...
  Найдено 3 сетей:
   1. Testardu                          RSSI:  -45 dBm  [SECURED]
   2. HomeNetwork                       RSSI:  -68 dBm  [SECURED]
   3. FreeWiFi                          RSSI:  -82 dBm  [OPEN]

[WiFi] Подключение к: Testardu
[WiFi] Пожалуйста, подождите...
........
[WiFi] ПОДКЛЮЧЕНО!
─────────────────────────────
Информация о подключении:
  SSID:        Testardu
  IP адрес:    10.78.242.150
  Маска:       255.255.255.0
  Шлюз:        10.78.242.1
  MAC адрес:   A4:CF:12:xx:xx:xx
  RSSI:        -45 dBm
  Сигнал: Отличный
─────────────────────────────

Для запуска NEXIS сервера:
  SERVER_HOST = "10.78.242.107"   ← IP вашего компьютера
```

**Важно для NEXIS:**
- ESP32 поддерживает только **2.4 GHz** (не 5 GHz!)
- `SERVER_HOST` — это IP вашего ПК, а не роутера
- Узнать IP ПК: `cmd → ipconfig → IPv4 Address`
