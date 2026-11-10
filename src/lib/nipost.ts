import "server-only";

/**
 * NIPOST digital postcode (NDAPS) — postcode.gov.ng.
 *
 * Format: 11 characters, e.g. EK-01-A03-FK-01
 *   state (2 letters) · LGA (2 digits) · district (3 letters/digits) · area (2 letters) · unit/building (2 digits)
 *
 * Format checks work offline. Confirming a postcode is a real building, and finding
 * the postcode for a map pin, needs NIPOST_API_KEY (developer dashboard at
 * postcode.gov.ng). Every API endpoint sends the key as `X-API-Key`.
 */

const BASE_URL = (process.env.NIPOST_API_URL ?? "https://api.postcode.gov.ng").replace(/\/+$/, "");
const TIMEOUT_MS = 10_000;

export type PostcodeStatus =
  | "verified" //       NIPOST confirms this building postcode exists
  | "not_found" //      well-formed, but NIPOST has no building with it
  | "invalid_format" // not an 11-character NIPOST postcode
  | "unchecked" //      well-formed; no API key, or NIPOST couldn't be reached
  | "none"; //          no postcode given

export interface PostcodeCheck {
  postcode: string | null; // hyphenated, e.g. EK-01-A03-FK-01
  status: PostcodeStatus;
  state: string | null;
  lga: string | null;
  locality: string | null;
  address: string | null; // NIPOST's recorded house address (level 2 keys)
  note: string | null; //    why it's unchecked, or what went wrong
}

const empty = (status: PostcodeStatus, postcode: string | null = null, note: string | null = null): PostcodeCheck => ({
  postcode,
  status,
  state: null,
  lga: null,
  locality: null,
  address: null,
  note,
});

/** Accepts any case, spaces or hyphens. Returns EK-01-A03-FK-01, or null if malformed. */
export function formatPostcode(input: string | null | undefined): string | null {
  if (!input) return null;
  const c = input.toUpperCase().replace(/[\s-]/g, "");
  const ok =
    /^[A-Z]{2}[0-9]{2}[A-Z0-9]{3}[A-Z]{2}[0-9]{2}$/.test(c) && c.slice(2, 4) !== "00" && c.slice(9, 11) !== "00";
  return ok ? `${c.slice(0, 2)}-${c.slice(2, 4)}-${c.slice(4, 7)}-${c.slice(7, 9)}-${c.slice(9, 11)}` : null;
}

export const nipostEnabled = () => !!process.env.NIPOST_API_KEY?.trim();

type Envelope = { data?: unknown; error?: { code?: string; message?: string } | string };
type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

async function call(path: string, params: Record<string, string>): Promise<{ data: unknown } | { error: string }> {
  const key = process.env.NIPOST_API_KEY?.trim();
  if (!key) return { error: "No NIPOST API key set" };
  const url = new URL(BASE_URL + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  try {
    const res = await fetch(url, {
      headers: { "X-API-Key": key, Accept: "application/json" },
      redirect: "manual", // never carry the key to another host
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    const body = (await res.json().catch(() => null)) as Envelope | null;
    if (!body) return { error: `NIPOST returned an unreadable answer (${res.status})` };
    if (body.error) {
      const e = body.error;
      return { error: typeof e === "string" ? e : [e.code, e.message].filter(Boolean).join(": ") || `HTTP ${res.status}` };
    }
    if (!res.ok) return { error: `NIPOST error ${res.status}` };
    return { data: body.data };
  } catch (err) {
    return { error: `Couldn't reach NIPOST: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/** Checks a postcode: format offline, then with NIPOST if a key is set. Never throws. */
export async function checkPostcode(input: string | null | undefined): Promise<PostcodeCheck> {
  if (!input?.trim()) return empty("none");
  const postcode = formatPostcode(input);
  if (!postcode) return empty("invalid_format", input.trim().toUpperCase(), "Not an 11-character NIPOST postcode");
  if (!nipostEnabled()) return empty("unchecked", postcode, "NIPOST API key not set yet — format checked only");

  const level = process.env.NIPOST_LOOKUP_LEVEL ?? "2"; // NIPOST caps this at your key's level
  const r = await call("/v1/lookup", { code: postcode, level });
  if ("error" in r) return empty("unchecked", postcode, r.error);
  const d = isObj(r.data) ? r.data : {};
  const admin = isObj(d.administrative_address) ? d.administrative_address : {};
  const valid = d.valid === true || d.status === "valid";
  return {
    postcode,
    status: valid ? "verified" : d.status === "invalid" ? "invalid_format" : "not_found",
    state: str(admin.state_name),
    lga: str(admin.lga_name),
    locality: str(admin.locality_name),
    address: str(d.recent_house_address),
    note: valid ? null : "NIPOST has no building with this postcode",
  };
}

/** Finds the NIPOST postcode of the building at (or nearest to) a map pin. */
export async function postcodeForPin(lat: number, lng: number, maxDistanceM = 50): Promise<PostcodeCheck> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return empty("none", null, "Map pin is not a valid coordinate");
  }
  if (!nipostEnabled()) return empty("none", null, "NIPOST API key not set yet");
  const r = await call("/v1/search/reverse", {
    lat: String(lat),
    lng: String(lng),
    max_distance_m: String(maxDistanceM),
  });
  if ("error" in r) return empty("none", null, r.error);
  const d = isObj(r.data) ? r.data : {};
  const unit = isObj(d.unit) ? d.unit : null;
  const postcode = formatPostcode(str(unit?.postcode));
  if (!d.found || !unit || !postcode) {
    return empty("none", null, str(d.message) ?? `No NIPOST building within ${maxDistanceM}m of the pin`);
  }
  return {
    postcode,
    status: "verified",
    state: str(unit.state_name) ?? str(d.state),
    lga: str(unit.lga_name),
    locality: str(unit.locality_name),
    address: str(unit.address),
    note: typeof unit.distance_m === "number" ? `Nearest building, ${Math.round(unit.distance_m)}m from the pin` : null,
  };
}

/** Columns saved on markets/shops rows. */
export function postcodeColumns(c: PostcodeCheck) {
  return {
    nipost_postcode: c.postcode,
    postcode_status: c.status,
    postcode_state: c.state,
    postcode_lga: c.lga,
    postcode_locality: c.locality,
    postcode_note: c.note,
    postcode_checked_at: new Date().toISOString(),
  };
}
