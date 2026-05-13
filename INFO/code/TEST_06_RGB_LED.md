# TEST 06 — RGB LED (Светодиод)

**Устройство:** RGB LED с общим катодом  
**Пины:** R=GPIO13, G=GPIO12, B=GPIO14  
**Питание:** 3.3V через резисторы 220 Ом  
**Библиотеки:** не нужны

**Что проверяет:**
- Управление каждым каналом R/G/B через `analogWrite` (0–255)
- Базовые цвета: красный, зелёный, синий, жёлтый, голубой, фиолетовый, белый
- Плавный переход (fade) между цветами
- Цветовые режимы NEXIS: OK (зелёный), WARN (жёлтый), DANGER (красный)

> RGB LED с общим катодом: катод → GND, каждый анод через резистор 220 Ом → GPIO.  
> GPIO HIGH = LED горит. Расчёт резистора: R = (3.3 - 2.0) / 0.01 = 130 Ом → берём 220 Ом.

---

```cpp
/*
 * NEXIS TEST — RGB LED (общий катод)
 * R → GPIO13, G → GPIO12, B → GPIO14
 * Каждый канал через резистор 220 Ом!
 * Питание: 3.3V
 *
 * Схема: GPIO → [220 Ом] → Анод LED → Катод → GND
 */

#define PIN_LED_R  13
#define PIN_LED_G  12
#define PIN_LED_B  14

void setLED(uint8_t r, uint8_t g, uint8_t b) {
  analogWrite(PIN_LED_R, r);
  analogWrite(PIN_LED_G, g);
  analogWrite(PIN_LED_B, b);
}

void ledOff() { setLED(0, 0, 0); }

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n=== NEXIS TEST: RGB LED ===");

  pinMode(PIN_LED_R, OUTPUT);
  pinMode(PIN_LED_G, OUTPUT);
  pinMode(PIN_LED_B, OUTPUT);
  ledOff();

  Serial.println("[OK] RGB LED инициализирован");
  Serial.println("     R=GPIO13, G=GPIO12, B=GPIO14");
  Serial.println("     Убедись: резисторы 220 Ом на каждом канале!");
  delay(500);
}

// Плавное нарастание яркости
void fadeIn(uint8_t r, uint8_t g, uint8_t b, int duration) {
  for (int i = 0; i <= 255; i++) {
    setLED(r * i / 255, g * i / 255, b * i / 255);
    delay(duration / 255);
  }
}

// Плавное угасание
void fadeOut(int duration) {
  uint8_t curR = analogRead(PIN_LED_R);  // не точно, но для демо
  for (int i = 255; i >= 0; i--) {
    analogWrite(PIN_LED_R, analogRead(PIN_LED_R) * i / 255);
    analogWrite(PIN_LED_G, analogRead(PIN_LED_G) * i / 255);
    analogWrite(PIN_LED_B, analogRead(PIN_LED_B) * i / 255);
    delay(duration / 255);
  }
  ledOff();
}

struct Color { uint8_t r, g, b; const char* name; };

Color colors[] = {
  {255,   0,   0, "Красный   (DANGER)"},
  {200, 150,   0, "Жёлтый    (WARN)"},
  {  0, 200,   0, "Зелёный   (OK)"},
  {  0,   0, 200, "Синий     (WiFi нет)"},
  {  0, 150,  50, "Зелёно-синий (Pomodoro WORK)"},
  {  0,   0, 100, "Синий dim (Pomodoro BREAK)"},
  {255, 255,   0, "Жёлтый яркий"},
  {  0, 255, 255, "Голубой (Cyan)"},
  {255,   0, 255, "Фиолетовый (Magenta)"},
  {255, 255, 255, "Белый"},
};

int colorIdx = 0;

void loop() {
  Color& c = colors[colorIdx];

  Serial.printf("Цвет: %-30s  R=%3d G=%3d B=%3d\n",
                c.name, c.r, c.g, c.b);

  // Плавно нарастаем
  for (int i = 0; i <= 255; i += 5) {
    setLED(c.r * i / 255, c.g * i / 255, c.b * i / 255);
    delay(10);
  }
  setLED(c.r, c.g, c.b);
  delay(1500);

  // Плавно гасим
  for (int i = 255; i >= 0; i -= 5) {
    setLED(c.r * i / 255, c.g * i / 255, c.b * i / 255);
    delay(10);
  }
  ledOff();
  delay(300);

  colorIdx = (colorIdx + 1) % (sizeof(colors) / sizeof(colors[0]));

  // После полного цикла — тест мигания для NEXIS состояний
  if (colorIdx == 0) {
    Serial.println("\n--- Тест: NEXIS состояния ---");

    Serial.println("ALERT_OK     → Зелёный");
    setLED(0, 200, 0); delay(1000);

    Serial.println("ALERT_WARN   → Жёлтый");
    setLED(200, 150, 0); delay(1000);

    Serial.println("ALERT_DANGER → Красный мигающий");
    for (int i = 0; i < 5; i++) {
      setLED(255, 0, 0); delay(200);
      ledOff(); delay(200);
    }

    Serial.println("WiFi нет     → Синий мигающий");
    for (int i = 0; i < 5; i++) {
      setLED(0, 0, 200); delay(500);
      ledOff(); delay(500);
    }

    Serial.println("\n--- Цикл завершён, повтор ---\n");
  }
}
```

---

**Ожидаемый вывод:**
```
=== NEXIS TEST: RGB LED ===
[OK] RGB LED инициализирован
     R=GPIO13, G=GPIO12, B=GPIO14
     Убедись: резисторы 220 Ом на каждом канале!
Цвет: Красный   (DANGER)          R=255 G=  0 B=  0
Цвет: Жёлтый    (WARN)            R=200 G=150 B=  0
...
```

**Цвета NEXIS Wellness Station:**
| Состояние | Цвет | R | G | B |
|-----------|------|---|---|---|
| ALERT_OK | Зелёный | 0 | 200 | 0 |
| ALERT_WARN | Жёлтый | 200 | 150 | 0 |
| ALERT_DANGER | Красный | 255 | 0 | 0 |
| WiFi нет | Синий мигающий | 0 | 0 | 200 |
| Pomodoro WORK | Зелёно-синий | 0 | 150 | 50 |
| Pomodoro BREAK | Синий dim | 0 | 0 | 100 |
