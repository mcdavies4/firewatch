# Firewatch Home prototype — parts list (one unit)

Ordered from Kunkune (kunkune.co.uk), 11 Nov 2026.

| Part | Price |
|---|---|
| ESP32 WROOM32 module 30 pins DOIT DevKit V1 with USB-C | £4.90 |
| MQ series Gas Sensor Module — MQ-2 (smoke) | £2.90 |
| MQ series Gas Sensor Module — MQ-7 (carbon monoxide) | £2.90 |
| KY-012 Active Buzzer 3-pin module 3V/5V | £1.49 |
| 65pcs Jumper Wire Cable Jumpers for Breadboard | £2.90 |
| Basic Electronics Starter Set (400-hole breadboard, jumpers, LEDs, buttons) | £4.90 |
| 600pcs Metal Film Resistors 1/4W 1%, 30 values (includes 10kΩ and 20kΩ) | £3.90 |
| **Total (before £2.90 delivery; free over £35)** | **£23.89** |

Not needed: LED and push button — the firmware uses the ESP32's onboard LED (GPIO2) and BOOT button (GPIO0).

## Voltage dividers (one per sensor)

MQ modules run on 5V (ESP32 `VIN` pin when powered by USB); their `AO` output can reach ~4–5V but ESP32 inputs take 3.3V max.

- MQ-2 `AO` → **10kΩ** → GPIO34, and GPIO34 → **20kΩ** → GND
- MQ-7 `AO` → **10kΩ** → GPIO35, and GPIO35 → **20kΩ** → GND

## Later: battery backup

TP4056 USB-C charger module (with protection), MT3608 boost converter set to 5V, one branded 18650 cell + holder.
