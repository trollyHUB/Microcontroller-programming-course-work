# TEST 01 — BME280 (Температура, Влажность, Давление)

**Датчик:** Bosch BME280  
**Интерфейс:** I2C — SDA=GPIO21, SCL=GPIO22, адрес 0x76  
**Питание:** 3.3V  
**Библиотеки:** Wire, Adafruit_BME280, Adafruit_Unified_Sensor

**Что проверяет:**
- Инициализация BME280 по I2C
- Чтение температуры (°C), влажности (%), давления (hPa)
- Вывод в Serial Monitor каждые 2 секунды

---

```cpp
/*
 * NEXIS TEST — BME280
 * Температура + Влажность + Давление
 * I2C: SDA=21, SCL=22, адрес 0x76
 * Питание: 3.3V
 *
 * Библиотеки (установить в Arduino IDE Library Manager):
 *   - Adafruit BME280 Library
 *   - Adafruit Unified Sensor
 */

#include <Wire.h>
#include <Adafruit_Sensor.h>
#include <Adafruit_BME280.h>

#define I2C_SDA  21
#define I2C_SCL  22
#define BME_ADDR 0x76   // Если не работает — попробуй 0x77

Adafruit_BME280 bme;

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n=== NEXIS TEST: BME280 ===");

  Wire.begin(I2C_SDA, I2C_SCL);

  if (!bme.begin(BME_ADDR, &Wire)) {
    Serial.println("[ERR] BME280 не найден!");
    Serial.println("      Проверь: SDA=21, SCL=22, VCC=3.3V, адрес 0x76");
    while (true) delay(1000);
  }

  // Режим FORCED — замер по запросу (экономит питание)
  bme.setSampling(Adafruit_BME280::MODE_FORCED,
                  Adafruit_BME280::SAMPLING_X1,  // температура
                  Adafruit_BME280::SAMPLING_X1,  // давление
                  Adafruit_BME280::SAMPLING_X1,  // влажность
                  Adafruit_BME280::FILTER_OFF);

  Serial.println("[OK] BME280 инициализирован (0x76, MODE_FORCED)");
  Serial.println("─────────────────────────");
}

void loop() {
  // В режиме FORCED нужно явно запустить замер
  bme.takeForcedMeasurement();

  float t = bme.readTemperature();
  float h = bme.readHumidity();
  float p = bme.readPressure() / 100.0f;

  // Проверка диапазонов
  bool tOK = (t > -40 && t < 85);
  bool hOK = (h >= 0 && h <= 100);
  bool pOK = (p > 870 && p < 1085);

  Serial.println("─────────────────────────");
  Serial.printf("Температура: %.2f °C  %s\n", t, tOK ? "✓" : "⚠ вне диапазона");
  Serial.printf("Влажность:   %.2f %%   %s\n", h, hOK ? "✓" : "⚠ вне диапазона");
  Serial.printf("Давление:    %.2f hPa %s\n", p, pOK ? "✓" : "⚠ вне диапазона");

  // Интерпретация давления
  if (pOK) {
    if (p > 1013) Serial.println("Давление: выше нормы (ясно)");
    else if (p < 1000) Serial.println("Давление: ниже нормы (возможен дождь)");
    else Serial.println("Давление: норма");
  }

  delay(2000);
}
```

---

**Ожидаемый вывод в Serial Monitor (115200 baud):**
```
=== NEXIS TEST: BME280 ===
[OK] BME280 инициализирован (0x76, MODE_FORCED)
─────────────────────────
─────────────────────────
Температура: 23.45 °C  ✓
Влажность:   48.20 %   ✓
Давление:    1012.80 hPa ✓
Давление: норма
```

**Если ошибка "BME280 не найден":**
1. Проверь питание — обязательно 3.3V (не 5V!)
2. Проверь пины SDA=21, SCL=22
3. Попробуй адрес `0x77` (когда пин SDO → VCC)
4. Подтягивающие резисторы 4.7 кОм на SDA и SCL (обычно уже на модуле)
