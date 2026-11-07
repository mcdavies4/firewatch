// Run: npx tsx scripts/test-normalise.ts — checks the payload interpreter against sample sensor messages.
import { normalise } from "../src/lib/ingest/normalise";
const mk = (d: object) => ({ end_device_ids: { dev_eui: "70b3d57ed0000001" }, uplink_message: { decoded_payload: d, rx_metadata: [{ gateway_ids: { gateway_id: "g1" }, rssi: -90 }] } });
const cases: [object, string][] = [
  [{ smoke_alarm: "alarm", battery: 90 }, "alarm"],
  [{ smoke_alarm: "normal", battery: 90 }, "heartbeat"],
  [{ smoke_status: 1 }, "alarm"],
  [{ temperature: 70 }, "alarm"],
  [{ tamper: "triggered" }, "tamper"],
  [{ battery: 80, temperature: 30 }, "heartbeat"],
  [{ event: "alarm_cleared" }, "alarm_cleared"],
  [{ fire_alarm: true }, "alarm"],
];
let fail = 0;
for (const [d, want] of cases) { const got = normalise(mk(d), 57)!.type; if (got !== want) { fail++; console.log("FAIL", d, got, want); } }
const cs = normalise({ deviceInfo: { devEui: "aa" }, object: { alarm: 1 }, rxInfo: [{ gatewayId: "x", rssi: -80 }] }, 57)!;
console.log(cs.source, cs.type, cs.devEui);
console.log(fail ? "failures" : "all pass");
