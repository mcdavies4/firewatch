# 🔥 Firewatch

Fire (and carbon monoxide) detection and response for Nigerian markets and homes.
A sensor detects smoke or heat, the app **calls and texts** the shop owner and night security within seconds, escalates up the chain (marshal → union → fire service) until someone presses **1** to say they're responding, and tells everyone else who's on it.

```
LoRaWAN smoke/heat sensor ──radio──▶ Market gateway ──SIM data──▶ The Things Network / ChirpStack
                                                                        │ webhook
                                                                        ▼
            Africa's Talking voice + SMS ◀── Firewatch (Next.js + Supabase) ──▶ Union dashboard
```

## What's in here

| Path | What it does |
|---|---|
| `src/app/api/ingest` | Webhook for TTN v3 and ChirpStack v4 uplinks |
| `src/lib/ingest/normalise.ts` | Turns any sensor's payload into `alarm / heartbeat / tamper / test` |
| `src/lib/alerts/engine.ts` | Opens alerts, calls/texts tiers, escalation, acknowledgement, health checks |
| `src/app/api/voice` | Africa's Talking voice callback — reads the alert aloud, "press 1 if you are responding" |
| `src/app/api/cron/escalate` | Run every minute: escalates unacknowledged alerts to the next tier |
| `src/app/api/cron/health` | Run every 15 min: marks silent sensors offline, texts technicians |
| `/dashboard` | Live market map — every shop as a tile, red when alarming |
| `/alerts`, `/alerts/[id]` | Alert history, who was called, response times, close as resolved / false alarm |
| `/setup` | Add markets, lines, shops, responders, sensors |
| `/shops/[id]` | Sensor health, **fire drill button**, fire-safety audit checklist |
| `/ack/[token]` | Public page from the SMS link — big "I'M RESPONDING" button |
| `/cert/[code]` | Public certificate check (print as a QR code on the shop certificate) |
| `scripts/simulate.ts` | Fake sensor messages for testing without hardware |

## 🏠 Firewatch Home

The same alert engine, for houses. A smoke + carbon monoxide unit sits in the home; the home is registered with its **NIPOST postcode, address, landmark and map pin**. When it goes off, the resident, family (including abroad), a neighbour and estate security get a call and SMS with exactly where to go — and the CO alert tells them to get out and switch off the generator.

| Path | What it does |
|---|---|
| `/homes` | All homes, colour-coded by status; add a home |
| `/homes/[id]` | Devices, fire/CO drill buttons, who gets alerted (family, neighbour, estate security, fire service) |
| `src/app/api/device` | Direct ingest for WiFi/GSM units — each device has its own key |
| `firmware/firewatch-home` | ESP32 + MQ-2 (smoke) + MQ-7 (CO) prototype sketch |
| `supabase/migrations/002_home.sql` | Adds homes, CO alerts and device keys — run after `001_init.sql` |

How it's modelled: a home is a `markets` row with `kind = 'home'` and one household in `shops` (`shop_number = 'HOME'`). Everything else — escalation, press-1, SMS ack link, offline checks — is shared with markets. Offline home devices text the resident instead of a technician.

### Try it without hardware
1. Run `002_home.sql` in Supabase.
2. **Homes → Add a home**, then add yourself as a family contact and **Add device**.
3. Press **Fire drill** or **CO drill**, or simulate the device itself:
   ```powershell
   npm run simulate -- home-co --eui <DEVICE_ID> --key <DEVICE_KEY>
   ```

### Virtual sensor (demo on a phone)
On a home's page, each device has **📱 Open virtual sensor**. Open that link on a second phone: it looks like an alarm, beeps, and has **Smoke detected** / **Carbon monoxide** buttons that post to `/api/device` exactly like the ESP32 does — so the real alert, texts and escalation run. The link contains the device key, so only share it with people you'd trust with the device.

### Build the prototype unit
Parts list, wiring and setup are at the top of `firmware/firewatch-home/firewatch-home.ino`. Paste the three `FW_*` lines from the home page, add WiFi details, flash, wait 3 minutes for warm-up, then tune the thresholds from the Serial Monitor.

## 📮 NIPOST digital postcode

Every home and market shop carries its **NIPOST digital postcode** (e.g. `EK-01-A03-FK-01`), and every alert — call, SMS, responder page — sends it, so responders go to the exact building.

| Where | What happens |
|---|---|
| Add a home / register a shop | Postcode is format-checked, then **verified with NIPOST** (`/v1/lookup`); state, LGA and locality are saved |
| Add a home with only a map pin | Firewatch asks NIPOST for the building's postcode (`/v1/search/reverse`) |
| Home page / shop page | Postcode badge (✓ NIPOST verified / ✗ not found / format OK), **Check with NIPOST** and **Find postcode from map pin** buttons |
| Alerts | SMS reads `… NIPOST EK-01-A03-FK-01 …`; the responder page shows the postcode large with "✓ Verified building" |

Code: `src/lib/nipost.ts`. Database: run `supabase/migrations/003_nipost.sql` after `002_home.sql`.

**Switching on live NIPOST checks:** get an API key from the developer dashboard at postcode.gov.ng, add `NIPOST_API_KEY` (and optionally `NIPOST_LOOKUP_LEVEL`, default 2) in Vercel, redeploy. Without a key everything still works and the format is checked offline. Test: `npx tsx --conditions=react-server scripts/test-nipost.ts EK-01-A03-FK-01`.

## ✈️ Telegram alerts

SMS to Nigerian lines with Do-Not-Disturb is rejected unless you have a transactional sender ID. Telegram alerts aren't affected: anyone who connects gets every alert on Telegram as well (address, NIPOST postcode, map, **I'M RESPONDING** button), plus the "X is responding" update.

1. Telegram → **@BotFather** → `/newbot` → copy the token.
2. Vercel: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME` → redeploy.
3. Supabase: run `supabase/migrations/004_telegram.sql`.
4. **Demo → Connect Telegram bot**, then **📲 Connect on Telegram** next to a phone number and press **Start** in Telegram.

Links are per phone number, so one connection covers every role that number has (owner, security, family…).

## 🚀 Growth features (run `supabase/migrations/005_growth.sql`)

| Feature | Where | What it does |
|---|---|---|
| **Impact page** | `/impact` (public) | Anonymous totals for officials and partners: coverage, real alerts, median time to a responder, drills, panic reports, by state and LGA (from NIPOST postcodes). Drills are counted separately. |
| **Fire stations** | `/stations` | Add stations by state + LGA. At tier `FIRE_STATION_TIER` (default 2) the station for the building's NIPOST LGA is called and texted automatically; if none is listed for that LGA, the state-wide ones are used. |
| **Panic button** | `/panic/<token>` (public, per shop/home) | Two taps raise a real alert ("FIRE REPORTED") with the postcode, no sensor needed. The link is on every shop and home page. |
| **Trader sign-up** | `/join/<token>` + `/join/<token>/poster` | Each market has a sign-up link and a printable QR poster. Traders register their own shop and get their panic button and Telegram link. |
| **Languages** | Language picker on every person | Alerts, updates and reminders in English, Pidgin, Hausa, Yoruba or Igbo. Wording lives in `src/lib/i18n.ts`; the non-English versions are drafts to check with native speakers. |
| **Certificate + insurer report** | `/cert/<code>/pdf` | 2-page PDF: certificate with a verification QR code, then a fire-risk report (audit checklist, detectors, responders, last 12 months of alerts and drills). |

Drills (Demo page buttons, virtual sensor) are labelled **DRILL** in messages and kept out of real-incident figures.

## Escalation

- **Tier 0** (immediately): shop owner (+ backup number) and tier-0 responders, e.g. night security.
- **Tier 1, 2, 3…**: called if nobody has pressed 1 within `ESCALATION_SECONDS` (default 60).
- Escalation stops as soon as anyone acknowledges — by pressing 1 on the call, tapping the SMS link, or from the dashboard. Everyone already contacted gets an "X is responding" SMS.
- A second alarm from the same sensor while an alert is open does **not** re-spam people.
- Sensors stay red until a human closes the alert as "Fire handled" or "False alarm".
- Responders can be market-wide or tied to one line/section.

## Setup (≈20 minutes)

### 1. Supabase
1. Create a project. In **SQL Editor**, run `supabase/migrations/001_init.sql`.
2. Optional demo data: run `supabase/seed.sql` (3 shops, 5 responders, 3 sensors).
3. Copy the project URL and **service role** key (Project Settings → API).

### 2. Run locally
```powershell
cd firewatch
npm install
copy .env.example .env.local   # then fill in SUPABASE_* and the secrets
npm run dev
```
Open http://localhost:3000 — log in with `DASHBOARD_USER` / `DASHBOARD_PASSWORD`.

### 3. Test without any hardware
`NOTIFY_MODE=log` prints calls and SMS to the terminal instead of sending them.
```powershell
npm run simulate -- alarm                                  # smoke alarm in shop A1
npm run simulate -- heat --eui 70B3D57ED0000003            # temperature 68°C in shop B1
npm run simulate -- heartbeat --eui 70B3D57ED0000002 --battery 12   # low battery
```
Then trigger escalation (in production a scheduler does this every minute):
```powershell
curl.exe -X POST http://localhost:3000/api/cron/escalate -H "Authorization: Bearer YOUR_CRON_SECRET"
```
Or open any shop and press **Run fire drill**.

### 4. Deploy (Vercel)
1. Push to GitHub, import into Vercel, add all env vars (set `APP_URL` to the Vercel URL).
2. Schedule the cron jobs: enable **pg_cron** and **pg_net** in Supabase (Database → Extensions), edit the URL/secret in `supabase/cron.sql`, and run it. (Vercel Hobby crons only run daily, so Supabase does the scheduling.)

### 5. Real calls and SMS (Africa's Talking)
1. Create an account, get your API key, buy a **voice virtual number**, and register an SMS sender ID.
2. On the voice number, set the callback URL to `https://YOUR_APP/api/voice`.
3. Fill the `AT_*` vars and set `NOTIFY_MODE=live`.
4. Put **your own number** as a tier-0 responder and run a fire drill.

### 6. Real sensors (The Things Network)
1. Buy a LoRaWAN gateway + LoRaWAN smoke/heat detectors (Milesight is a good starting brand). Register the gateway and devices on The Things Network (EU868 works in the UK for bench testing).
2. In the TTN application, add the device's **payload formatter** (the vendor publishes one), then **Integrations → Webhooks → Custom**:
   - Base URL: `https://YOUR_APP/api/ingest`
   - Header: `X-Webhook-Secret: <INGEST_WEBHOOK_SECRET>`
   - Enable **Uplink message**.
3. Power the sensor. It appears in **Setup → Sensors** as *Unassigned* — assign it to a shop using its DevEUI.
4. Look at a real alarm payload in the TTN console. If the app doesn't classify it correctly, adjust `interpret()` in `src/lib/ingest/normalise.ts` and run `npx tsx scripts/test-normalise.ts`.

ChirpStack works the same way: HTTP integration → `https://YOUR_APP/api/ingest?secret=...` (JSON encoding).

## Before a real market pilot
- [ ] Confirm LoRaWAN frequency plan allowed in Nigeria and NCC type approval for the devices you import
- [ ] Battery/solar backup for each gateway — a dead gateway means a dead market
- [ ] Set the sensor heartbeat interval and `OFFLINE_MINUTES` to match (e.g. 60-min heartbeat → 180 min)
- [ ] Get the local fire station's direct number for tier 2
- [ ] Train night security and marshals, and run a drill with real calls
- [ ] Swap basic-auth dashboard login for Supabase Auth once more than one office uses it

## Env vars
See `.env.example`. Never expose `SUPABASE_SERVICE_ROLE_KEY` to the browser — it's only used server-side.
#   f i r e w a t c h 
 
 