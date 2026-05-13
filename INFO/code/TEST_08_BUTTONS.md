# TEST 08 — Кнопки (MODE и OK)

**Устройства:** 2 тактовые кнопки  
**Пины:** MODE=GPIO32, OK=GPIO33  
**Режим:** INPUT_PULLUP (нажатие = LOW)  
**Библиотеки:** не нужны

**Что проверяет:**
- Чтение нажатий через аппаратные прерывания ISR (FALLING)
- Дебаунс 200 мс (защита от дребезга контакта)
- Счётчики нажатий для каждой кнопки
- Длинное нажатие (удержание > 1 сек)

---

```cpp
/*
 * NEXIS TEST — Кнопки MODE (GPIO32) и OK (GPIO33)
 * Подключение: кнопка между GPIO и GND
 * Режим: INPUT_PULLUP (в покое GPIO=HIGH, нажатие=LOW)
 *
 * Почему INPUT_PULLUP?
 *   Без подтяжки GPIO "висит в воздухе" — случайные HIGH/LOW от наводок.
 *   Встроенный pullup ~45 кОм подтягивает к HIGH. Кнопка замыкает на GND.
 */

#define PIN_BTN_MODE  32
#define PIN_BTN_OK    33
#define DEBOUNCE_MS   200   // 200 мс — достаточно для любой механической кнопки

// ISR флаги (volatile — запрет кэширования в CPU регистре)
volatile bool isrBtnMode = false;
volatile bool isrBtnOK   = false;

// IRAM_ATTR — ISR в Internal RAM, не в Flash (защита от Guru Meditation)
void IRAM_ATTR onBtnMode() { isrBtnMode = true; }
void IRAM_ATTR onBtnOK()   { isrBtnOK   = true; }

// Счётчики нажатий
int countMode = 0;
int countOK   = 0;

// Таймеры для дебаунса
uint32_t lastMode = 0;
uint32_t lastOK   = 0;

// Для определения длинного нажатия
uint32_t modePressStart = 0;
uint32_t okPressStart   = 0;
bool     modeLong = false;
bool     okLong   = false;

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n=== NEXIS TEST: Кнопки ===");
  Serial.println("MODE → GPIO32 (кнопка между GPIO32 и GND)");
  Serial.println("OK   → GPIO33 (кнопка между GPIO33 и GND)");
  Serial.println("─────────────────────────────");

  // INPUT_PULLUP — встроенный подтягивающий резистор ~45 кОм
  pinMode(PIN_BTN_MODE, INPUT_PULLUP);
  pinMode(PIN_BTN_OK,   INPUT_PULLUP);

  // FALLING — нарастающий фронт при нажатии (HIGH→LOW при INPUT_PULLUP)
  attachInterrupt(digitalPinToInterrupt(PIN_BTN_MODE), onBtnMode, FALLING);
  attachInterrupt(digitalPinToInterrupt(PIN_BTN_OK),   onBtnOK,   FALLING);

  Serial.println("[OK] Прерывания настроены (FALLING)");
  Serial.println("Нажми кнопки!");
}

void handleButtons() {
  uint32_t now = millis();

  // --- Кнопка MODE ---
  if (isrBtnMode && (now - lastMode > DEBOUNCE_MS)) {
    isrBtnMode = false;
    lastMode   = now;
    countMode++;

    Serial.printf("[MODE] Нажатие #%d!\n", countMode);

    // Проверяем: кнопка ещё нажата?
    if (digitalRead(PIN_BTN_MODE) == LOW) {
      modePressStart = now;
      modeLong = false;
    }
  }

  // Длинное нажатие MODE (> 1 сек)
  if (!modeLong && modePressStart > 0 &&
      digitalRead(PIN_BTN_MODE) == LOW &&
      now - modePressStart > 1000) {
    modeLong = true;
    Serial.println("[MODE] ДЛИННОЕ НАЖАТИЕ (> 1 сек)!");
  }

  // Отпускание MODE
  if (modePressStart > 0 && digitalRead(PIN_BTN_MODE) == HIGH) {
    uint32_t held = now - modePressStart;
    if (held > 50) {  // Фильтр дребезга при отпускании
      if (!modeLong) Serial.printf("[MODE] Отпущена (удержание: %lu мс)\n", held);
    }
    modePressStart = 0;
    modeLong = false;
  }

  // --- Кнопка OK ---
  if (isrBtnOK && (now - lastOK > DEBOUNCE_MS)) {
    isrBtnOK = false;
    lastOK   = now;
    countOK++;

    Serial.printf("[OK]   Нажатие #%d!\n", countOK);

    if (digitalRead(PIN_BTN_OK) == LOW) {
      okPressStart = now;
      okLong = false;
    }
  }

  // Длинное нажатие OK
  if (!okLong && okPressStart > 0 &&
      digitalRead(PIN_BTN_OK) == LOW &&
      now - okPressStart > 1000) {
    okLong = true;
    Serial.println("[OK]   ДЛИННОЕ НАЖАТИЕ (> 1 сек)!");
  }

  // Отпускание OK
  if (okPressStart > 0 && digitalRead(PIN_BTN_OK) == HIGH) {
    uint32_t held = now - okPressStart;
    if (held > 50) {
      if (!okLong) Serial.printf("[OK]   Отпущена (удержание: %lu мс)\n", held);
    }
    okPressStart = 0;
    okLong = false;
  }
}

void loop() {
  handleButtons();

  // Периодический статус
  static uint32_t lastStatus = 0;
  if (millis() - lastStatus > 5000) {
    lastStatus = millis();
    Serial.printf("[Статус] MODE: %d нажатий, OK: %d нажатий\n",
                  countMode, countOK);
    Serial.printf("[Статус] MODE сейчас: %s, OK сейчас: %s\n",
                  digitalRead(PIN_BTN_MODE) == LOW ? "НАЖАТА" : "отпущена",
                  digitalRead(PIN_BTN_OK) == LOW   ? "НАЖАТА" : "отпущена");
  }

  delay(10);
}
```

---

**Ожидаемый вывод:**
```
=== NEXIS TEST: Кнопки ===
MODE → GPIO32 (кнопка между GPIO32 и GND)
OK   → GPIO33 (кнопка между GPIO33 и GND)
─────────────────────────────
[OK] Прерывания настроены (FALLING)
Нажми кнопки!
[MODE] Нажатие #1!
[MODE] Отпущена (удержание: 87 мс)
[OK]   Нажатие #1!
[OK]   ДЛИННОЕ НАЖАТИЕ (> 1 сек)!
[Статус] MODE: 1 нажатий, OK: 1 нажатий
```

**Почему прерывания, а не polling?**  
Кнопка нажимается ~50–100 мс. Если `loop()` занят HTTP POST (~50 мс) или UART (500 мс таймаут ZM106) — polling пропустит нажатие. ISR фиксирует флаг мгновенно, независимо от загрузки loop().

**Дребезг контакта:**  
Механический контакт при нажатии вибрирует 5–20 мс — без защиты одно нажатие генерирует 10–50 ISR вызовов. `DEBOUNCE_MS = 200` гасит весь дребезг.
