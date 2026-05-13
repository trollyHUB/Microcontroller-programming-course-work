# TEST 10 — MQ-135 (CO₂ / Качество воздуха, аналоговый)

**Датчик:** MQ-135 (электрохимический, VOC/CO₂)  
**Интерфейс:** ADC — GPIO36 (ADC1, только вход)  
**Питание:** 5V (нагревательный элемент требует 5V!)  
**Библиотеки:** не нужны

**Что проверяет:**
- Чтение аналогового сигнала (0–4095)
- Линейную аппроксимацию ADC → ppm CO₂
- Определение качества воздуха по порогам ASHRAE 62.1

> MQ-135 — аналоговый датчик без UART.  
> Не является истинным CO₂-датчиком (NDIR). Реагирует на CO₂, этанол, аммиак, бензол.  
> Требует прогрева **24–48 часов** для стабильных показаний!

---

```cpp
/*
 * NEXIS TEST — MQ-135
 * CO₂ / Качество воздуха (аналоговый ADC)
 * GPIO36 (ADC1) → AO пин MQ-135
 * Питание нагревателя: 5V (VIN ESP32)!
 * Питание логики: 3.3V или 5V
 *
 * ВАЖНО: MQ-135 требует 24–48 часов прогрева для калибровки!
 * В первые часы показания будут завышены.
 *
 * GPIO36 (VP) — Input-only пин, только ADC1.
 * ADC1 работает независимо от WiFi (ADC2 — нет).
 */

#define PIN_MQ135      36
#define CO2_WARN       800    // ppm — ASHRAE 62.1
#define CO2_DANGER     1200   // ppm — ASHRAE 62.1
#define SAMPLES        10     // Усреднение

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n=== NEXIS TEST: MQ-135 CO2 ===");
  Serial.println("GPIO36 (ADC1) → AO пин MQ-135");
  Serial.println("Питание нагревателя: 5V!");
  Serial.println("─────────────────────────────");
  Serial.println("ВНИМАНИЕ: Датчик требует прогрева 24–48 часов.");
  Serial.println("В первые минуты показания некорректны!");
  Serial.println("");

  analogReadResolution(12);       // 12-бит: 0–4095
  analogSetAttenuation(ADC_11db); // Диапазон до ~3.1V

  Serial.println("[OK] ADC инициализирован: 12-бит, 11dB");

  // Ждём минимальный прогрев
  Serial.println("Ожидание прогрева 60 секунд...");
  for (int i = 60; i > 0; i -= 5) {
    Serial.printf("  %d сек...\n", i);
    delay(5000);
  }
  Serial.println("Начинаем измерения (показания ещё могут быть нестабильны)");
  Serial.println("─────────────────────────────");
}

// Усреднение нескольких замеров
int readMQ135Avg() {
  long sum = 0;
  for (int i = 0; i < SAMPLES; i++) {
    sum += analogRead(PIN_MQ135);
    delay(10);
  }
  return sum / SAMPLES;
}

// Простая линейная аппроксимация ADC → ppm
// Диапазон: 0 ADC = 400 ppm (чистый воздух), 4095 ADC = 2000 ppm
// Для точной калибровки нужно измерение на свежем воздухе (baseline)
int adcToCO2(int adcValue) {
  return map(adcValue, 0, 4095, 400, 2000);
}

void loop() {
  int rawAvg = readMQ135Avg();
  int rawSingle = analogRead(PIN_MQ135);
  float voltage = rawAvg * 3.3f / 4095.0f;
  int ppm = adcToCO2(rawAvg);

  Serial.println("─────────────────────────────");
  Serial.printf("ADC (сред./%d): %4d\n", SAMPLES, rawAvg);
  Serial.printf("ADC (разовый): %4d\n", rawSingle);
  Serial.printf("Напряжение:    %.3f V\n", voltage);
  Serial.printf("CO2 (approx):  %d ppm\n", ppm);

  // Интерпретация по ASHRAE 62.1
  if (ppm >= CO2_DANGER) {
    Serial.println("Статус: [DANGER] CO2 > 1200 ppm! Проветрить!");
  } else if (ppm >= CO2_WARN) {
    Serial.println("Статус: [WARN] CO2 > 800 ppm, повышен");
  } else {
    Serial.println("Статус: [OK] CO2 в норме < 800 ppm");
  }

  // Справочные значения CO2
  Serial.println("\nСправка CO2:");
  Serial.println("  400 ppm   = свежий воздух (улица)");
  Serial.println("  600 ppm   = хорошо проветренное помещение");
  Serial.println("  800 ppm   = WARN: проветрить");
  Serial.println("  1000 ppm  = снижение концентрации -15% (Harvard COGfx)");
  Serial.println("  1200 ppm  = DANGER: немедленно проветрить");

  Serial.println("\nВНИМАНИЕ: Показания приближённые (линейная аппроксимация).");
  Serial.println("Для точных данных: калибровка на улице + нелинейная кривая.");

  delay(3000);
}
```

---

**Ожидаемый вывод:**
```
=== NEXIS TEST: MQ-135 CO2 ===
GPIO36 (ADC1) → AO пин MQ-135
─────────────────────────────
[OK] ADC инициализирован: 12-бит, 11dB
─────────────────────────────
ADC (сред./10): 1024
ADC (разовый): 1031
Напряжение:    0.825 V
CO2 (approx):  800 ppm
Статус: [WARN] CO2 > 800 ppm, повышен
```

**Сравнение MQ-135 vs ZM106-VOC vs SCD41:**
| Датчик | Тип | Точность | Прогрев | Интерфейс | Цена |
|--------|-----|---------|---------|----------|------|
| MQ-135 | Электрохим. | ±15% | 24–48 ч | Аналог | ~500 ₸ |
| ZM106-VOC | Электрохим. | ±10% | 5 мин | UART | ~2000 ₸ |
| SCD41 | NDIR (фото.) | ±40 ppm | 0 | I2C | ~8000 ₸ |

MQ-135 — для грубой оценки и учебного проекта. SCD41 — для точных измерений.
