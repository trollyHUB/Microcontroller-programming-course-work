# TEST 11 — ZM106-VOC (UART CO₂/VOC)

**Датчик:** Winsen ZM106-VOC (электрохимический)  
**Интерфейс:** UART — Serial2, RX=GPIO16, TX=GPIO17, 9600 baud  
**Питание:** 5V (от VIN)  
**Библиотеки:** не нужны

**Что проверяет:**
- UART протокол ZM106: 9-байтовый запрос и ответ
- Расчёт и проверку CRC
- Декодирование концентрации в ppm
- Обработку таймаута (500 мс)

> ZM106 — НЕ истинный CO₂ датчик (NDIR). Измеряет суммарные VOC + CO₂.  
> В офисных условиях коррелирует с CO₂ (человек выдыхает CO₂ + VOC вместе).

---

```cpp
/*
 * NEXIS TEST — Winsen ZM106-VOC
 * UART протокол: 9 байт запрос / 9 байт ответ
 * Serial2: RX=GPIO16, TX=GPIO17, 9600 baud, 8N1
 * Питание: 5V (VIN ESP32 → датчик)
 *
 * ВАЖНО: ZM106 работает на 5V логике.
 * TX датчика = 5V. GPIO16 ESP32 максимум 3.6V.
 * Для защиты: делитель R1=10кОм, R2=20кОм на RX линии.
 * (В практике работает напрямую, но без гарантии от Espressif)
 */

#define PIN_ZM106_RX  16
#define PIN_ZM106_TX  17
#define ZM106_BAUD    9600
#define ZM106_TIMEOUT 500  // мс — ждём ответ

// Команда запроса концентрации (9 байт)
// FF 01 86 00 00 00 00 00 79
const uint8_t CMD_READ[] = {0xFF, 0x01, 0x86, 0x00, 0x00, 0x00, 0x00, 0x00, 0x79};

// Расчёт CRC: (~(сумма байт 1..7)) + 1 (дополнение до двух)
uint8_t calcCRC(uint8_t* buf) {
  uint8_t sum = 0;
  for (int i = 1; i <= 7; i++) sum += buf[i];
  return (~sum) + 1;
}

// Чтение концентрации, возвращает ppm или -1 при ошибке
int readZM106() {
  // Очищаем буфер входящих данных
  while (Serial2.available()) Serial2.read();

  // Отправляем команду запроса
  Serial2.write(CMD_READ, 9);
  Serial2.flush();

  // Ждём ответ (9 байт) с таймаутом
  uint8_t response[9] = {};
  uint32_t start = millis();
  int bytesRead = 0;

  while (bytesRead < 9 && millis() - start < ZM106_TIMEOUT) {
    if (Serial2.available()) {
      response[bytesRead++] = Serial2.read();
    }
  }

  // Проверка: получили 9 байт?
  if (bytesRead < 9) {
    Serial.printf("[ZM106] Таймаут! Получено %d/9 байт за %lu мс\n",
                  bytesRead, millis() - start);
    return -1;
  }

  // Проверка заголовка
  if (response[0] != 0xFF || response[1] != 0x86) {
    Serial.printf("[ZM106] Неверный заголовок: 0x%02X 0x%02X (ожидали FF 86)\n",
                  response[0], response[1]);
    return -1;
  }

  // Проверка CRC
  uint8_t expectedCRC = calcCRC(response);
  if (response[8] != expectedCRC) {
    Serial.printf("[ZM106] CRC ошибка: получен 0x%02X, ожидали 0x%02X\n",
                  response[8], expectedCRC);
    return -1;
  }

  // Декодирование: ppm = (HIGH << 8) | LOW
  int ppm = (response[2] << 8) | response[3];
  return ppm;
}

void printResponse(uint8_t* buf, int len) {
  Serial.print("[ZM106] Ответ (HEX): ");
  for (int i = 0; i < len; i++) {
    Serial.printf("%02X ", buf[i]);
  }
  Serial.println();
}

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n=== NEXIS TEST: ZM106-VOC UART ===");
  Serial.println("RX=GPIO16, TX=GPIO17, 9600 baud");
  Serial.println("Питание: 5V");
  Serial.println("─────────────────────────────────");

  // Serial2 — второй UART ESP32
  // UART0 (GPIO1/3) занят для Serial Monitor
  // UART2 (GPIO16/17) → ZM106
  Serial2.begin(ZM106_BAUD, SERIAL_8N1, PIN_ZM106_RX, PIN_ZM106_TX);
  delay(2000);  // ZM106 нужно время на старт

  Serial.println("[OK] Serial2 инициализирован (9600, 8N1)");
  Serial.println("\nПротокол запроса (9 байт):");
  Serial.print("  >> ");
  for (uint8_t b : CMD_READ) Serial.printf("%02X ", b);
  Serial.println();
  Serial.println("  FF=заголовок, 01=адрес, 86=команда Read, 79=CRC");
  Serial.println("\nОжидаемый ответ (9 байт):");
  Serial.println("  FF 86 HH LL 00 00 00 00 CRC");
  Serial.println("  ppm = (HH << 8) | LL");
  Serial.println("─────────────────────────────────");
}

void loop() {
  Serial.println("─────────────────────────────────");
  Serial.println("Отправляем запрос...");

  // Показываем команду
  Serial.print("[>>] ");
  for (uint8_t b : CMD_READ) Serial.printf("%02X ", b);
  Serial.println();

  int ppm = readZM106();

  if (ppm >= 0) {
    Serial.printf("[ZM106] CO2/VOC: %d ppm\n", ppm);

    // Интерпретация по ASHRAE 62.1
    if (ppm >= 1200) {
      Serial.println("Статус: [DANGER] > 1200 ppm! Немедленно проветрить!");
    } else if (ppm >= 800) {
      Serial.println("Статус: [WARN] > 800 ppm, рекомендуется проветрить");
    } else {
      Serial.println("Статус: [OK] Качество воздуха хорошее");
    }

    // Расчёт CRC для примера
    Serial.printf("CRC проверка: ОК (0x%02X)\n",
                  (~(0x86)) + 1);  // упрощённо
  } else {
    Serial.println("[ERR] Ошибка чтения ZM106");
    Serial.println("      Проверь: TX→GPIO16, RX→GPIO17, 5V питание");
  }

  delay(5000);  // Опрашиваем каждые 5 секунд
}
```

---

**Ожидаемый вывод:**
```
=== NEXIS TEST: ZM106-VOC UART ===
RX=GPIO16, TX=GPIO17, 9600 baud
─────────────────────────────────
[OK] Serial2 инициализирован (9600, 8N1)

Протокол запроса (9 байт):
  >> FF 01 86 00 00 00 00 00 79
  FF=заголовок, 01=адрес, 86=команда Read, 79=CRC

─────────────────────────────────
Отправляем запрос...
[>>] FF 01 86 00 00 00 00 00 79
[ZM106] CO2/VOC: 652 ppm
Статус: [OK] Качество воздуха хорошее
```

**Декодирование примера:**
```
Ответ: FF 86 02 8A 00 00 00 00 CRC
HIGH = 0x02 = 2
LOW  = 0x8A = 138
ppm  = (2 << 8) | 138 = 512 + 138 = 650 ppm
```

**Расчёт CRC:**
```
CRC = (~(0x86 + 0x02 + 0x8A + 0x00 + 0x00 + 0x00 + 0x00)) + 1
    = (~0x12) + 1
    = 0xED + 1 = 0xEE
```

**Если таймаут:**
1. Проверь TX датчика → GPIO16 ESP32 (RX)
2. Проверь RX датчика ← GPIO17 ESP32 (TX)
3. Проверь питание 5V на датчик
4. Подожди 30 сек после включения (датчик прогревается)
