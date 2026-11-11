/*
 * Firewatch Home — ESP32 prototype unit (smoke + carbon monoxide)
 *
 * Parts (about ₦30–50k):
 *   - ESP32 DevKit (WROOM-32)
 *   - MQ-2 smoke/gas module  -> AO to GPIO34
 *   - MQ-7 CO module         -> AO to GPIO35
 *   - Active buzzer module   -> GPIO25 (KY-012 type: VCC 3.3V, GND, S/I-O)
 *   - Status LED             -> the board's own blue LED (GPIO2), nothing to buy
 *   - Test button            -> the board's own BOOT button (GPIO0), nothing to buy
 *   - Optional battery sense -> GPIO32 via 100k/100k divider from 18650 (+)
 *   - 18650 cell + TP4056 charger + 5V boost so it survives power cuts
 *
 * MQ modules run on 5V (VIN pin of the ESP32 when on USB) and their AO can reach ~4-5V.
 * ESP32 inputs are 3.3V max, so put a divider on each AO: AO -> 10k -> pin, and
 * pin -> 10k -> 10k -> GND (two 10k in series = 20k). Four 10k resistors per unit.
 *
 * Setup:
 *   1. Add the home + device in Firewatch (Homes → home → Add device).
 *   2. Open "Firmware settings for this device" and paste the three lines below.
 *   3. Fill WIFI_SSID / WIFI_PASS, flash with Arduino IDE (board: ESP32 Dev Module).
 *   4. Leave it powered 3 minutes to warm up, then watch the Serial Monitor
 *      (115200) for raw readings in clean air and set the thresholds just above.
 *
 * This is a demo/pilot unit, not a certified alarm. For real installs, pair it with
 * (or replace it by) certified smoke and CO alarms.
 */

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>

// ---- Paste from the Firewatch home page ----
#define FW_SERVER     "https://YOUR-APP.vercel.app/api/device"
#define FW_DEVICE_ID  "PASTE_DEVICE_ID"
#define FW_DEVICE_KEY "PASTE_DEVICE_KEY"

// ---- WiFi ----
#define WIFI_SSID "your-wifi"
#define WIFI_PASS "your-password"

// ---- Pins ----
#define PIN_SMOKE   34
#define PIN_CO      35
#define PIN_BUZZER  25
#define PIN_LED     2    // onboard LED (DOIT DevKit V1 / most 30-pin boards)
#define PIN_BUTTON  0    // onboard BOOT button; press after start-up to send a test
#define PIN_BATTERY 32
#define HAS_BATTERY_SENSE false   // set true once the divider is wired

// ---- Thresholds (raw 0–4095; tune after warm-up in clean air) ----
#define SMOKE_ALARM_RAW 1800
#define CO_ALARM_RAW    1600
#define CONFIRM_READS   3          // consecutive high readings before alarming (avoids blips)

// ---- Timing ----
#define READ_EVERY_MS      2000UL
#define HEARTBEAT_EVERY_MS (15UL * 60UL * 1000UL)   // set OFFLINE_MINUTES on the server to ~3x this
#define WARMUP_MS          (3UL * 60UL * 1000UL)
#define RESEND_EVERY_MS    (60UL * 1000UL)          // keep reporting while the alarm lasts

enum Hazard { NONE, FIRE, CO };

Hazard state = NONE;
int smokeHigh = 0, coHigh = 0;
unsigned long lastRead = 0, lastHeartbeat = 0, lastAlarmSent = 0;
bool alarmDelivered = false;

int readAvg(int pin) {
  long sum = 0;
  for (int i = 0; i < 8; i++) { sum += analogRead(pin); delay(5); }
  return sum / 8;
}

// Very rough ppm estimate for the dashboard only. Alarms use the raw threshold.
int approxCoPpm(int raw) {
  if (raw < 400) return 0;
  return map(raw, 400, 4095, 0, 1000);
}

int batteryPct() {
  if (!HAS_BATTERY_SENSE) return -1;
  float v = analogReadMilliVolts(PIN_BATTERY) * 2 / 1000.0;   // 100k/100k divider
  int pct = (int)((v - 3.3) / (4.2 - 3.3) * 100);
  return constrain(pct, 0, 100);
}

void connectWifi() {
  if (WiFi.status() == WL_CONNECTED) return;
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 15000) delay(250);
  Serial.println(WiFi.status() == WL_CONNECTED ? "WiFi connected" : "WiFi failed (will retry)");
}

bool send(const char* event, int smokeRaw, int coRaw) {
  connectWifi();
  if (WiFi.status() != WL_CONNECTED) return false;

  WiFiClientSecure client;
  client.setInsecure();   // prototype: skips certificate check. Pin the CA for production.
  HTTPClient http;
  if (!http.begin(client, FW_SERVER)) return false;
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Key", FW_DEVICE_KEY);

  String body = String("{\"device_id\":\"") + FW_DEVICE_ID + "\"" +
                ",\"event\":\"" + event + "\"" +
                ",\"smoke_raw\":" + smokeRaw +
                ",\"co_raw\":" + coRaw +
                ",\"co_ppm\":" + approxCoPpm(coRaw) +
                ",\"rssi\":" + WiFi.RSSI();
  int bat = batteryPct();
  if (bat >= 0) body += String(",\"battery\":") + bat;
  body += "}";

  int code = http.POST(body);
  Serial.printf("POST %s -> %d %s\n", event, code, http.getString().c_str());
  http.end();
  return code >= 200 && code < 300;
}

void sound(Hazard h, unsigned long now) {
  if (h == NONE) { digitalWrite(PIN_BUZZER, LOW); digitalWrite(PIN_LED, LOW); return; }
  // Fire: fast beeps. CO: 4 beeps then pause (the usual CO alarm pattern).
  bool on = (h == FIRE) ? ((now / 250) % 2 == 0) : ((now % 5000) < 2000 && (now / 250) % 2 == 0);
  digitalWrite(PIN_BUZZER, on);
  digitalWrite(PIN_LED, on);
}

void setup() {
  Serial.begin(115200);
  pinMode(PIN_BUZZER, OUTPUT);
  pinMode(PIN_LED, OUTPUT);
  pinMode(PIN_BUTTON, INPUT_PULLUP);
  analogSetAttenuation(ADC_11db);

  // Short chirp so you know it booted.
  digitalWrite(PIN_BUZZER, HIGH); delay(120); digitalWrite(PIN_BUZZER, LOW);

  connectWifi();
  Serial.println("Warming up sensors (3 min)...");
  unsigned long start = millis();
  while (millis() - start < WARMUP_MS) {
    digitalWrite(PIN_LED, (millis() / 1000) % 2);
    delay(200);
  }
  digitalWrite(PIN_LED, LOW);
  send("heartbeat", readAvg(PIN_SMOKE), readAvg(PIN_CO));
  lastHeartbeat = millis();
}

void loop() {
  unsigned long now = millis();
  sound(state, now);

  // Test button: local beep + "test" event so you can check the link end to end.
  if (digitalRead(PIN_BUTTON) == LOW) {
    delay(50);
    if (digitalRead(PIN_BUTTON) == LOW) {
      digitalWrite(PIN_BUZZER, HIGH); delay(400); digitalWrite(PIN_BUZZER, LOW);
      send("test", readAvg(PIN_SMOKE), readAvg(PIN_CO));
      while (digitalRead(PIN_BUTTON) == LOW) delay(20);
    }
  }

  if (now - lastRead >= READ_EVERY_MS) {
    lastRead = now;
    int smoke = readAvg(PIN_SMOKE);
    int co = readAvg(PIN_CO);
    Serial.printf("smoke=%d co=%d state=%d\n", smoke, co, state);

    smokeHigh = smoke >= SMOKE_ALARM_RAW ? smokeHigh + 1 : 0;
    coHigh = co >= CO_ALARM_RAW ? coHigh + 1 : 0;

    Hazard next = smokeHigh >= CONFIRM_READS ? FIRE : coHigh >= CONFIRM_READS ? CO : NONE;

    if (next != NONE && (next != state || !alarmDelivered || now - lastAlarmSent >= RESEND_EVERY_MS)) {
      // Server ignores repeats while an alert is open, so resending is safe and
      // makes sure the alarm gets through if WiFi dropped the first time.
      alarmDelivered = send(next == FIRE ? "fire" : "co", smoke, co);
      lastAlarmSent = now;
    }
    if (next == NONE && state != NONE) {
      send("heartbeat", smoke, co);   // readings back to normal; a person still closes the alert
      alarmDelivered = false;
    }
    state = next;

    if (now - lastHeartbeat >= HEARTBEAT_EVERY_MS) {
      if (send("heartbeat", smoke, co)) lastHeartbeat = now;
    }
  }
}
