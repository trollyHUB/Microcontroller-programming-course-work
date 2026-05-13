# TEST 09 — DHT11 (Температура и Влажность)

**Датчик:** DHT11  
**Интерфейс:** 1-Wire Digital — GPIO4  
**Питание:** 3.3V  
**Библиотека:** DHT sensor library (by Adafruit)

**Что проверяет:**
- Инициализация DHT11
- Чтение температуры (°C) и влажности (%)
- Сравнение точности: DHT11 vs BME280 (разница в точности)
- Обработка ошибок (NaN при сбое)

> DHT11: точность ±2°C, ±5% RH, дискрет 1°C/1%. Только целые числа.  
> DHT22: точность ±0.5°C, ±2–5% RH, дискрет 0.1°C/0.1%. Лучше DHT11.  
> BME280 — точнее обоих: ±1°C, ±3% RH, плюс давление.

---

```cpp
/*
 * NEXIS TEST — DHT11
 * Температура + Влажность (дополнительный датчик)
 * GPIO4 → Data DHT11
 * Питание: 3.3V
 * Подтягивающий резистор 10 кОм между Data и VCC (обычно на модуле)
 *
 * Библиотека: DHT sensor library by Adafruit
 *
 * ВАЖНО: DHT11 медленный — минимальный интервал опроса 2 секунды!
 */

#include <DHT.h>

#define PIN_DHT   4
#define DHT_TYPE  DHT11   // Для DHT22: замени на DHT22

DHT dht(PIN_DHT, DHT_TYPE);

void setup() {
  Serial.begin(115200);
  delay(1000);  // DHT11 нужно время на прогрев
  Serial.println("\n=== NEXIS TEST: DHT11 ===");
  Serial.println("GPIO4 → Data DHT11");
  Serial.println("Питание: 3.3V");
  Serial.println("─────────────────────────");

  dht.begin();
  Serial.println("[OK] DHT11 инициализирован");
  Serial.println("     Интервал опроса: не менее 2 секунд");
  Serial.println("     Точность: ±2°C, ±5% RH (целые числа)");
  delay(2000);  // Первый замер DHT11 часто некорректен
}

int readCount = 0;
int errorCount = 0;

void loop() {
  readCount++;

  // DHT11 требует минимум 2 секунды между чтениями
  float t = dht.readTemperature();
  float h = dht.readHumidity();

  Serial.println("─────────────────────────");
  Serial.printf("Замер #%d:\n", readCount);

  if (isnan(t) || isnan(h)) {
    errorCount++;
    Serial.println("[ERR] Ошибка чтения DHT11!");
    Serial.println("      Проверь: GPIO4, VCC=3.3V, резистор 10 кОм");
    Serial.printf("      Ошибок: %d из %d\n", errorCount, readCount);
  } else {
    Serial.printf("Температура: %.1f °C\n", t);
    Serial.printf("Влажность:   %.1f %%\n", h);

    // Тепловой индекс (ощущаемая температура)
    float heatIndex = dht.computeHeatIndex(t, h, false);
    Serial.printf("Ощущается как: %.1f °C\n", heatIndex);

    // Интерпретация по ГОСТ 30494-2011
    if (t > 30.0) Serial.println("Температура: [DANGER] выше 30°C!");
    else if (t > 27.0) Serial.println("Температура: [WARN] выше 27°C");
    else Serial.println("Температура: [OK]");

    if (h > 75.0) Serial.println("Влажность: [DANGER] выше 75%!");
    else if (h > 65.0) Serial.println("Влажность: [WARN] выше 65%");
    else if (h < 30.0) Serial.println("Влажность: [WARN] ниже 30% (сухо)");
    else Serial.println("Влажность: [OK]");

    // Сравнение с BME280 (для проекта)
    Serial.println("\nСправка (сравнение датчиков):");
    Serial.println("  DHT11:  ±2°C,  ±5% RH, целые числа");
    Serial.println("  DHT22:  ±0.5°C,±2% RH, 0.1° дискрет");
    Serial.println("  BME280: ±1°C,  ±3% RH + давление");
  }

  // Минимальный интервал DHT11 = 2000 мс
  delay(2500);
}
```

---

**Ожидаемый вывод:**
```
=== NEXIS TEST: DHT11 ===
GPIO4 → Data DHT11
Питание: 3.3V
─────────────────────────
[OK] DHT11 инициализирован
     Интервал опроса: не менее 2 секунд
     Точность: ±2°C, ±5% RH (целые числа)
─────────────────────────
Замер #1:
Температура: 23.0 °C
Влажность:   48.0 %
Ощущается как: 22.7 °C
Температура: [OK]
Влажность: [OK]
```

**Если ошибка чтения:**
- DHT11 выдаёт NaN при неверном подключении или слишком частом опросе
- Минимальный интервал: **2000 мс** (в коде 2500 мс — безопасно)
- Подтягивающий резистор 10 кОм: между Data и VCC (обычно встроен в модуль)
- Первый замер после включения часто некорректен — добавлен `delay(2000)` в setup()

**Когда использовать DHT11 вместо BME280:**
- Нет BME280 в наличии
- Не нужно давление
- Достаточна точность ±2°C (для грубой оценки)
