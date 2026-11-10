// Run: npx tsx --conditions=react-server scripts/test-nipost.ts — offline checks of the NIPOST postcode format.
// With NIPOST_API_KEY set it also does one live lookup: npx tsx --conditions=react-server scripts/test-nipost.ts EK-01-A03-FK-01
import { formatPostcode, checkPostcode } from "../src/lib/nipost";

const cases: [string, string | null][] = [
  ["EK-01-A03-FK-01", "EK-01-A03-FK-01"],
  ["ek 01 a03 fk 01", "EK-01-A03-FK-01"],
  ["FC02A09DB09", "FC-02-A09-DB-09"],
  ["FC 02 A09 DB 09", "FC-02-A09-DB-09"],
  ["EK-00-A03-FK-01", null], // LGA 00
  ["EK-01-A03-FK-00", null], // unit 00
  ["E1-01-A03-FK-01", null], // digit in state
  ["EK-01-A03-F1-01", null], // digit in area
  ["100271", null], //          old 6-digit code
  ["", null],
];
let fail = 0;
for (const [input, want] of cases) {
  const got = formatPostcode(input);
  if (got !== want) { fail++; console.log("FAIL", JSON.stringify(input), got, want); }
}
console.log(fail ? `${fail} failures` : "format: all pass");

const live = process.argv[2];
if (live) checkPostcode(live).then((r) => console.log(r));
