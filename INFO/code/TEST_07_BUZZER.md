# TEST 07 — Зуммер (Buzzer)

**Устройство:** Пассивный зуммер (пьезо)  
**Пин:** GPIO25  
**Питание:** 3.3V (от GPIO напрямую, ток < 40 мА)  
**Библиотеки:** не нужны (использует `tone()`)

**Что проверяет:**
- Генерацию тонов через `tone()`
- Все звуковые сигналы NEXIS: OK, WARN, DANGER, Pomodoro Done
- Простую мелодию
- Диапазон частот

> Пассивный зуммер требует внешний сигнал частоты — ESP32 генерирует ШИМ через `tone()`.  
> Активный зуммер (с генератором внутри) просто включается HIGH/LOW — для него `tone()` не нужен.

---

```cpp
/*
 * NEXIS TEST — Зуммер (пассивный пьезо)
 * GPIO25 → зуммер → GND
 * Питание: 3.3V от GPIO (ток не более 40 мА!)
 *
 * ВАЖНО: Пассивный зуммер (без встроенного генератора).
 * Если зуммер активный (только пищит при HIGH) — этот код не подходит.
 */

#define PIN_BUZZER  25

void beep(int freq, int ms) {
  tone(PIN_BUZZER, freq, ms);
  delay(ms + 10);  // Ждём завершения тона + небольшой паузы
}

void beepOK() {
  Serial.println("[Звук] OK — один тон 1000 Гц");
  beep(1000, 100);
}

void beepWarn() {
  Serial.println("[Звук] WARN — три коротких сигнала 800 Гц");
  for (int i = 0; i < 3; i++) {
    beep(800, 150);
    delay(200);
  }
}

void beepDanger() {
  Serial.println("[Звук] DANGER — пять сигналов 500 Гц");
  for (int i = 0; i < 5; i++) {
    beep(500, 100);
    delay(150);
  }
}

void beepPomoDone() {
  Serial.println("[Звук] POMODORO DONE — восходящая мелодия");
  int melody[] = {1047, 1175, 1319, 1397};  // C6, D6, E6, F6
  for (int n : melody) {
    beep(n, 200);
    delay(20);
  }
}

void playScale() {
  Serial.println("[Звук] Гамма До-мажор");
  // До, Ре, Ми, Фа, Соль, Ля, Си, До
  int notes[] = {262, 294, 330, 349, 392, 440, 494, 523};
  const char* names[] = {"До", "Ре", "Ми", "Фа", "Соль", "Ля", "Си", "До"};
  for (int i = 0; i < 8; i++) {
    Serial.printf("  %s (%d Гц)\n", names[i], notes[i]);
    beep(notes[i], 300);
    delay(50);
  }
}

void freqSweep() {
  Serial.println("[Звук] Свип частот 200→2000 Гц");
  for (int f = 200; f <= 2000; f += 50) {
    tone(PIN_BUZZER, f, 30);
    delay(35);
  }
  noTone(PIN_BUZZER);
}

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n=== NEXIS TEST: Зуммер ===");
  Serial.println("GPIO25 → зуммер → GND");
  Serial.println("─────────────────────────");
  delay(1000);
}

void loop() {
  Serial.println("\n=== Тест 1: Базовые сигналы NEXIS ===");
  beepOK();
  delay(800);
  beepWarn();
  delay(800);
  beepDanger();
  delay(1000);
  beepPomoDone();
  delay(1000);

  Serial.println("\n=== Тест 2: Гамма ===");
  playScale();
  delay(1000);

  Serial.println("\n=== Тест 3: Свип частот ===");
  freqSweep();
  delay(1000);

  Serial.println("\n=== Тест 4: Частоты ===");
  int testFreqs[] = {200, 400, 800, 1000, 1500, 2000, 3000, 4000};
  for (int f : testFreqs) {
    Serial.printf("  %4d Гц — 300 мс\n", f);
    beep(f, 300);
    delay(200);
  }

  Serial.println("\n--- Пауза 3 секунды, повтор ---\n");
  delay(3000);
}
```

---

**Ожидаемый вывод:**
```
=== NEXIS TEST: Зуммер ===
GPIO25 → зуммер → GND
─────────────────────────

=== Тест 1: Базовые сигналы NEXIS ===
[Звук] OK — один тон 1000 Гц
[Звук] WARN — три коротких сигнала 800 Гц
[Звук] DANGER — пять сигналов 500 Гц
[Звук] POMODORO DONE — восходящая мелодия
```

**Если зуммер молчит:**
- Проверь что зуммер пассивный (активный реагирует только на HIGH, без `tone()`)
- Проверь GPIO25 → зуммер → GND (полярность у пьезо обычно не важна)
- `tone()` генерирует ШИМ — нужен именно пассивный зуммер

**Звуки NEXIS Wellness Station:**
| Событие | Тип | Частота | Длительность |
|---------|-----|---------|-------------|
| OK / подтверждение | 1 сигнал | 1000 Гц | 100 мс |
| WARN | 3 сигнала | 800 Гц | 150 мс × 3 |
| DANGER | 5 сигналов | 500 Гц | 100 мс × 5 |
| Pomodoro Done | Мелодия | C6→F6 | 200 мс × 4 |
