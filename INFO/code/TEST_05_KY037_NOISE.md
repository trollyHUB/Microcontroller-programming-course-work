# TEST 05 — KY-037 (Уровень шума)

**Датчик:** KY-037 — электретный микрофон с усилителем  
**Интерфейс:** ADC — GPIO39 (ADC1, только вход)  
**Питание:** 3.3V  
**Библиотеки:** не нужны

**Что проверяет:**
- Чтение аналогового сигнала (0–4095, 12-бит)
- Конвертацию ADC → уровень дБ (линейная аппроксимация 30–90 дБ)
- Пиковое значение за серию замеров (более точное измерение амплитуды)

> GPIO39 (VN) — вход только для чтения (Input-only), нет pull-up/pull-down.  
> ADC1 (GPIO32–39) не конфликтует с WiFi. ADC2 — конфликтует!

---

```cpp
/*
 * NEXIS TEST — KY-037 Уровень шума
 * Микрофон + усилитель → аналоговый сигнал → GPIO39 (ADC1)
 * Питание: 3.3V
 *
 * Подключение:
 *   A0 (аналог) → GPIO39
 *   VCC → 3.3V
 *   GND → GND
 *   D0 (цифровой порог) — не используется
 */

#define PIN_NOISE    39
#define NOISE_DB_MIN 30.0f   // Минимум диапазона (тишина)
#define NOISE_DB_MAX 90.0f   // Максимум диапазона (очень громко)
#define SAMPLES      20      // Количество замеров для пикового значения

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n=== NEXIS TEST: KY-037 Шум ===");

  analogReadResolution(12);          // 12-бит: 0–4095
  analogSetAttenuation(ADC_11db);    // Диапазон до ~3.1V

  Serial.println("[OK] ADC настроен: 12-бит, затухание 11dB");
  Serial.println("     GPIO39 (ADC1) — Input only, без pullup");
  Serial.println("─────────────────────────────");
}

float readNoise() {
  int peak = 0;
  int minVal = 4095;

  for (int i = 0; i < SAMPLES; i++) {
    int v = analogRead(PIN_NOISE);
    if (v > peak) peak = v;
    if (v < minVal) minVal = v;
    delay(2);
  }

  // Линейная аппроксимация: ADC 0–4095 → дБ 30–90
  float dB = NOISE_DB_MIN + (peak / 4095.0f) * (NOISE_DB_MAX - NOISE_DB_MIN);
  return dB;
}

void loop() {
  // Одиночный замер
  int rawSingle = analogRead(PIN_NOISE);
  float voltage = rawSingle * 3.3f / 4095.0f;

  // Пиковый замер (серия из 20 замеров)
  float dB = readNoise();

  Serial.println("─────────────────────────────");
  Serial.printf("ADC raw:    %4d  (%.3f V)\n", rawSingle, voltage);
  Serial.printf("Пик за 20:  %.1f dB\n", dB);

  // Интерпретация уровня шума по ГОСТ 12.1.003-83
  if (dB > 70) {
    Serial.println("Статус: [DANGER] Слишком громко! > 70 дБ");
  } else if (dB > 55) {
    Serial.println("Статус: [WARN] Повышенный шум > 55 дБ");
  } else {
    Serial.println("Статус: [OK] Нормальный уровень шума");
  }

  // Визуализация уровня (ASCII-бар)
  int bars = (int)((dB - NOISE_DB_MIN) / (NOISE_DB_MAX - NOISE_DB_MIN) * 20);
  bars = max(0, min(20, bars));
  Serial.print("Уровень:    [");
  for (int i = 0; i < 20; i++) Serial.print(i < bars ? "█" : "░");
  Serial.println("]");

  delay(500);
}
```

---

**Ожидаемый вывод:**
```
=== NEXIS TEST: KY-037 Шум ===
[OK] ADC настроен: 12-бит, затухание 11dB
     GPIO39 (ADC1) — Input only, без pullup
─────────────────────────────
─────────────────────────────
ADC raw:     312  (0.251 V)
Пик за 20:   34.6 dB
Статус: [OK] Нормальный уровень шума
Уровень:    [█░░░░░░░░░░░░░░░░░░░]
─────────────────────────────
ADC raw:    1820  (1.467 V)
Пик за 20:   56.7 dB
Статус: [WARN] Повышенный шум > 55 дБ
Уровень:    [█████████░░░░░░░░░░░]
```

**Важно:**
- KY-037 не калиброван — значения дБ приблизительные (±10–15 дБ)
- Для точных измерений нужна акустическая калибровка на эталонном источнике
- Минимальный ADC (~100) = фоновый шум электроники (всегда есть)
- Потенциометр на KY-037 регулирует усиление аналогового сигнала
