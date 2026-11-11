import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import QRCode from "qrcode";
import { db } from "@/lib/supabase";
import { env } from "@/lib/env";
import { AUDIT_ITEMS } from "@/lib/ui";

export const dynamic = "force-dynamic";

const NAVY = rgb(0.06, 0.16, 0.29);
const RED = rgb(0.86, 0.15, 0.15);
const GREEN = rgb(0.02, 0.47, 0.34);
const GREY = rgb(0.3, 0.33, 0.38);
const INK = rgb(0.07, 0.09, 0.15);

type Cert = {
  certificate_code: string;
  valid_until: string;
  score: number;
  passed: boolean;
  auditor_name: string;
  created_at: string;
  checklist: Record<string, boolean>;
  notes: string | null;
  shop_id: string;
  shops: {
    id: string;
    market_id: string;
    shop_number: string;
    owner_name: string;
    trade: string | null;
    nipost_postcode: string | null;
    postcode_status: string | null;
    postcode_lga: string | null;
    postcode_state: string | null;
    markets: {
      name: string;
      kind: string;
      city: string | null;
      state: string | null;
      address: string | null;
      nipost_postcode: string | null;
      postcode_status: string | null;
    } | null;
  } | null;
};

/** Fire safety certificate (page 1) + insurer/bank report (page 2) as a PDF. */
export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const supa = db();
  const { data } = await supa
    .from("audits")
    .select(
      "certificate_code, valid_until, score, passed, auditor_name, created_at, checklist, notes, shop_id, shops(id, market_id, shop_number, owner_name, trade, nipost_postcode, postcode_status, postcode_lga, postcode_state, markets(name, kind, city, state, address, nipost_postcode, postcode_status))",
    )
    .eq("certificate_code", code.toUpperCase())
    .maybeSingle();
  if (!data) return new Response("Certificate not found", { status: 404 });
  const c = data as unknown as Cert;
  const shop = c.shops;
  const site = shop?.markets;
  const isHome = site?.kind === "home";

  const yearAgo = new Date(Date.now() - 365 * 86400_000).toISOString();
  const [{ data: sensors }, { data: alerts }, { data: contacts }] = await Promise.all([
    supa.from("sensors").select("kind, label, status, last_seen_at, battery_pct").eq("shop_id", c.shop_id),
    supa
      .from("alerts")
      .select("created_at, acknowledged_at, status, is_drill, hazard")
      .eq("shop_id", c.shop_id)
      .gte("created_at", yearAgo),
    shop?.market_id
      ? supa.from("contacts").select("role").eq("active", true).eq("market_id", shop.market_id)
      : Promise.resolve({ data: [] as { role: string }[] }),
  ]);

  const pdf = await PDFDocument.create();
  pdf.setTitle(`Firewatch certificate ${c.certificate_code}`);
  pdf.setAuthor("Firewatch by The 36th Solutions Ltd");
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const verifyUrl = `${env.appUrl()}/cert/${c.certificate_code}`;
  const qr = await pdf.embedPng(await QRCode.toBuffer(verifyUrl, { margin: 1, width: 360 }));

  const valid = new Date(c.valid_until) >= new Date();
  const d = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const postcode = isHome ? site?.nipost_postcode : shop?.nipost_postcode;
  const pcVerified = (isHome ? site?.postcode_status : shop?.postcode_status) === "verified";
  const premises = isHome
    ? [site?.name, site?.address, site?.city].filter(Boolean).join(", ")
    : `Shop ${shop?.shop_number}, ${site?.name}${site?.city ? `, ${site.city}` : ""}`;

  // ---------- Page 1: certificate ----------
  const p1 = pdf.addPage([595.28, 841.89]);
  const W = p1.getWidth();
  const H = p1.getHeight();
  p1.drawRectangle({ x: 24, y: 24, width: W - 48, height: H - 48, borderColor: NAVY, borderWidth: 3 });
  p1.drawRectangle({ x: 32, y: 32, width: W - 64, height: H - 64, borderColor: RED, borderWidth: 1 });
  p1.drawRectangle({ x: 32, y: H - 150, width: W - 64, height: 118, color: NAVY });
  centre(p1, "FIREWATCH", bold, 14, H - 70, rgb(0.98, 0.8, 0.3));
  centre(p1, "FIRE SAFETY CERTIFICATE", bold, 26, H - 105, rgb(1, 1, 1));
  centre(p1, isHome ? "Residential premises" : "Market premises", font, 12, H - 128, rgb(0.85, 0.88, 0.95));

  let y = H - 205;
  centre(p1, "This certifies that the premises", font, 12, y, GREY);
  y -= 34;
  y = centreWrap(p1, premises, bold, 20, y, W - 120, INK);
  if (postcode) {
    y -= 8;
    centre(p1, `NIPOST ${postcode}${pcVerified ? "  (verified)" : ""}`, bold, 14, y, NAVY);
    y -= 22;
  }
  centre(p1, `${isHome ? "Resident" : "Occupier"}: ${shop?.owner_name ?? ""}${shop?.trade ? ` - ${shop.trade}` : ""}`, font, 12, y, INK);
  y -= 34;
  y = centreWrap(
    p1,
    "has been audited against the Firewatch fire safety checklist and is fitted with Firewatch fire alerting connected to named responders.",
    font,
    12,
    y,
    W - 140,
    GREY,
  );

  y -= 30;
  centre(p1, valid ? "VALID" : "EXPIRED", bold, 34, y, valid ? GREEN : RED);
  y -= 30;
  const rows: [string, string][] = [
    ["Audit score", `${c.score}%`],
    ["Audited by", c.auditor_name],
    ["Audit date", d(c.created_at)],
    ["Valid until", d(c.valid_until)],
    ["Certificate no.", c.certificate_code],
  ];
  for (const [k, v] of rows) {
    p1.drawText(k, { x: 150, y, size: 12, font, color: GREY });
    p1.drawText(v, { x: 290, y, size: 12, font: bold, color: INK });
    y -= 20;
  }

  p1.drawImage(qr, { x: W / 2 - 55, y: 88, width: 110, height: 110 });
  centre(p1, "Scan to check this certificate is genuine and current", font, 9.5, 74, GREY);
  centre(p1, verifyUrl, font, 8.5, 62, GREY);
  centre(p1, "Issued by Firewatch - The 36th Solutions Ltd, RC 9440452, Abuja, Nigeria", font, 8.5, 46, GREY);

  // ---------- Page 2: insurer / bank report ----------
  const p2 = pdf.addPage([595.28, 841.89]);
  let yy = H - 60;
  p2.drawText("Fire risk report", { x: 50, y: yy, size: 22, font: bold, color: NAVY });
  yy -= 18;
  p2.drawText(`For insurers and lenders - certificate ${c.certificate_code} - generated ${d(new Date().toISOString())}`, {
    x: 50,
    y: yy,
    size: 9.5,
    font,
    color: GREY,
  });
  yy -= 26;
  yy = section(p2, "Premises", yy, bold);
  for (const line of [
    premises,
    postcode ? `NIPOST digital postcode: ${postcode}${pcVerified ? " (verified with NIPOST)" : " (not yet verified)"}` : "NIPOST postcode: not recorded",
    [shop?.postcode_lga && `${shop.postcode_lga} LGA`, shop?.postcode_state ?? site?.state].filter(Boolean).join(", "),
  ].filter(Boolean) as string[]) {
    yy = wrap(p2, line, font, 10.5, 50, yy, W - 100, INK);
  }

  yy -= 8;
  yy = section(p2, `Audit checklist - ${c.score}% (${c.passed ? "PASS" : "FAIL"})`, yy, bold);
  for (const item of AUDIT_ITEMS) {
    const ok = !!c.checklist?.[item.key];
    p2.drawText(ok ? "YES" : "NO", { x: 50, y: yy, size: 9.5, font: bold, color: ok ? GREEN : RED });
    yy = wrap(p2, item.label, font, 10, 82, yy, W - 132, INK);
  }
  if (c.notes) yy = wrap(p2, `Auditor notes: ${c.notes}`, font, 10, 50, yy - 4, W - 100, GREY);

  yy -= 8;
  yy = section(p2, "Detection and alerting", yy, bold);
  const devs = (sensors ?? []).filter((s) => s.kind !== "panic");
  const panic = (sensors ?? []).some((s) => s.kind === "panic");
  yy = wrap(p2, `${devs.length} detector(s) fitted${devs.length ? ": " + devs.map((s) => `${s.label ?? s.kind} (${s.status})`).join(", ") : ""}.`, font, 10.5, 50, yy, W - 100, INK);
  yy = wrap(p2, `Panic button: ${panic ? "in use" : "available"}. Alerts go by call/SMS (and Telegram where connected) and escalate until a responder confirms.`, font, 10.5, 50, yy, W - 100, INK);
  const roles = new Map<string, number>();
  for (const r of (contacts ?? []) as { role: string }[]) roles.set(r.role, (roles.get(r.role) ?? 0) + 1);
  if (roles.size) {
    yy = wrap(p2, `Responders on file: ${[...roles.entries()].map(([r, n]) => `${n} ${r.replace("_", " ")}`).join(", ")}.`, font, 10.5, 50, yy, W - 100, INK);
  }

  yy -= 8;
  yy = section(p2, "Last 12 months", yy, bold);
  const all = (alerts ?? []) as { created_at: string; acknowledged_at: string | null; status: string; is_drill: boolean | null }[];
  const realA = all.filter((a) => !a.is_drill);
  const drillA = all.filter((a) => a.is_drill);
  const times = all
    .filter((a) => a.acknowledged_at)
    .map((a) => (new Date(a.acknowledged_at!).getTime() - new Date(a.created_at).getTime()) / 1000)
    .sort((a, b) => a - b);
  const med = times.length ? times[Math.floor(times.length / 2)] : null;
  for (const line of [
    `Real alerts: ${realA.length} (false alarms: ${realA.filter((a) => a.status === "false_alarm").length})`,
    `Drills: ${drillA.length}`,
    `Median time to a confirmed responder: ${med === null ? "no data yet" : med < 60 ? `${Math.round(med)} seconds` : `${Math.floor(med / 60)} min ${Math.round(med % 60)} s`}`,
  ]) {
    yy = wrap(p2, line, font, 10.5, 50, yy, W - 100, INK);
  }

  p2.drawText("Verify this report's certificate:", { x: 50, y: 70, size: 9, font, color: GREY });
  p2.drawText(verifyUrl, { x: 50, y: 58, size: 9, font: bold, color: NAVY });
  p2.drawText("Firewatch - The 36th Solutions Ltd, RC 9440452 - the36thltd@outlook.com", { x: 50, y: 42, size: 8.5, font, color: GREY });

  const bytes = await pdf.save();
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="Firewatch-certificate-${c.certificate_code}.pdf"`,
    },
  });
}

function centre(p: PDFPage, text: string, f: PDFFont, size: number, y: number, color = INK) {
  const w = f.widthOfTextAtSize(text, size);
  p.drawText(text, { x: (p.getWidth() - w) / 2, y, size, font: f, color });
}

function lines(text: string, f: PDFFont, size: number, max: number) {
  const out: string[] = [];
  let cur = "";
  for (const word of text.split(/\s+/)) {
    const next = cur ? `${cur} ${word}` : word;
    if (f.widthOfTextAtSize(next, size) > max && cur) {
      out.push(cur);
      cur = word;
    } else cur = next;
  }
  if (cur) out.push(cur);
  return out;
}

function centreWrap(p: PDFPage, text: string, f: PDFFont, size: number, y: number, max: number, color = INK) {
  for (const l of lines(text, f, size, max)) {
    centre(p, l, f, size, y, color);
    y -= size * 1.35;
  }
  return y;
}

function wrap(p: PDFPage, text: string, f: PDFFont, size: number, x: number, y: number, max: number, color = INK) {
  for (const l of lines(text, f, size, max)) {
    p.drawText(l, { x, y, size, font: f, color });
    y -= size * 1.4;
  }
  return y - 2;
}

function section(p: PDFPage, title: string, y: number, f: PDFFont) {
  p.drawText(title, { x: 50, y, size: 13, font: f, color: NAVY });
  p.drawLine({ start: { x: 50, y: y - 5 }, end: { x: p.getWidth() - 50, y: y - 5 }, thickness: 0.6, color: rgb(0.8, 0.82, 0.86) });
  return y - 22;
}
