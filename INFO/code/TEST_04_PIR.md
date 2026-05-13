# TEST 04 — PIR HC-SR501 (Датчик движения)

**Датчик:** HC-SR501 PIR (Passive Infrared)  
**Интерфейс:** Digital — GPIO27  
**Питание:** 5V (от VIN)  
**Библиотеки:** не нужны

**Что проверяет:**
- Чтение сигнала PIR через `digitalRead`
- Обнаружение движения через аппаратное прерывание ISR (RISING)
- Дебаунс и защита от ложных срабатываний

> PIR питается от 5V, но выходной сигнал OUT = 3.3V HIGH — прямо совместим с ESP32 GPIO.

---

```cpp
/*
 * NEXIS TEST — PIR HC-SR501
 * Датчик движения (пассивный ИК)
 * GPIO27 → сигнал OUT датчика
 * Питание: 5V (VIN пин ESP32 или отдельный источник)
 *
 * Настройки на датчике:
 *   - Потенциометр чувствительности (левый) → по центру
 *   - Потенциометр задержки (правый) → минимум (против часовой)
 *   - Джампер: H (retriggering) или L (single trigger)
 */

#define PIN_PIR  27

volatile bool motionDetected = false;
uint32_t lastMotionTime = 0;

void IRAM_ATTR onMotion() {
  motionDetected = true;
}

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n=== NEXIS TEST: PIR HC-SR501 ===");
  Serial.println("Ожидаем прогрева датчика (30 секунд)...");

  pinMode(PIN_PIR, INPUT);

  // Прерывание по нарастающему фронту (движение = LOW→HIGH)
  attachInterrupt(digitalPinToInterrupt(PIN_PIR), onMotion, RISING);

  // PIR требует ~30 сек прогрева для калибровки
  for (int i = 30; i > 0; i--) {
    Serial.printf("  Прогрев: %d сек...\n", i);
    delay(1000);
  }

  Serial.println("[OK] PIR готов! Начинаем мониторинг.");
  Serial.println("─────────────────────────────────");
}

void loop() {
  uint32_t now = millis();

  // Обработка флага от ISR
  if (motionDetected) {
    motionDetected = false;
    lastMotionTime = now;
    Serial.printf("[ISR] ДВИЖЕНИЕ ОБНАРУЖЕНО! Время: %lu мс\n", now);
  }

  // Также читаем напрямую (для проверки текущего состояния)
  bool state = digitalRead(PIN_PIR);

  // Показываем статус каждые 2 секунды
  static uint32_t lastPrint = 0;
  if (now - lastPrint > 2000) {
    lastPrint = now;

    if (state == HIGH) {
      Serial.println("[PIR] Статус: ДВИЖЕНИЕ ЕСТЬ (HIGH)");
    } else {
      uint32_t sinceMotion = now - lastMotionTime;
      if (lastMotionTime == 0) {
        Serial.println("[PIR] Статус: тихо (движений не было)");
      } else {
        Serial.printf("[PIR] Статус: тихо (последнее движение %lu сек назад)\n",
                      sinceMotion / 1000);
      }
    }
  }

  delay(10);
}
```

---

**Ожидаемый вывод:**
```
=== NEXIS TEST: PIR HC-SR501 ===
Ожидаем прогрева датчика (30 секунд)...
  Прогрев: 30 сек...
  ...
[OK] PIR готов! Начинаем мониторинг.
─────────────────────────────────
[PIR] Статус: тихо (движений не было)
[ISR] ДВИЖЕНИЕ ОБНАРУЖЕНО! Время: 32150 мс
[PIR] Статус: ДВИЖЕНИЕ ЕСТЬ (HIGH)
[PIR] Статус: тихо (последнее движение 3 сек назад)
```

**Почему IRAM_ATTR у ISR?**  
ESP32 хранит код в Flash. При записи во Flash кэш инвалидируется, и ISR из Flash может упасть с Guru Meditation Error. `IRAM_ATTR` размещает функцию в IRAM (быстрой внутренней RAM) — ISR работает всегда.

**Настройка чувствительности:**
- Левый потенциометр (SX) — дальность обнаружения (3–7 м)
- Правый потенциометр (TX) — время удержания сигнала HIGH (5 с – 5 мин)
- Джампер H = retriggering (таймер сбрасывается при каждом движении)
- Джампер L = single trigger (однократный сигнал)
