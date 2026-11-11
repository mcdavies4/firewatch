/* eslint-disable @typescript-eslint/no-explicit-any -- test fake */
// In-memory stand-in for src/lib/supabase.ts, used by scripts/test-alert-flow.ts only.
type Row = Record<string, any>;
export const tables: Record<string, Row[]> = {};
let n = 0;
const id = () => `id-${++n}`;

class Q {
  private filters: ((r: Row) => boolean)[] = [];
  private op: "select" | "insert" | "update" = "select";
  private payload: Row | Row[] | null = null;
  private one = false;
  private cols = "*";
  constructor(private table: string) {
    tables[table] ??= [];
  }
  select(cols = "*") { this.cols = cols; return this; }
  insert(p: Row | Row[]) { this.op = "insert"; this.payload = p; return this; }
  update(p: Row) { this.op = "update"; this.payload = p; return this; }
  upsert(p: Row) { this.op = "insert"; this.payload = p; return this; }
  eq(k: string, v: any) { this.filters.push((r) => r[k] === v); return this; }
  neq(k: string, v: any) { this.filters.push((r) => r[k] !== v); return this; }
  in(k: string, v: any[]) { this.filters.push((r) => v.includes(r[k])); return this; }
  is(k: string, v: any) { this.filters.push((r) => (r[k] ?? null) === v); return this; }
  not(k: string, _op: string, v: any) { this.filters.push((r) => (r[k] ?? null) !== v); return this; }
  lte(k: string, v: any) { this.filters.push((r) => r[k] <= v); return this; }
  gte(k: string, v: any) { this.filters.push((r) => r[k] >= v); return this; }
  delete() { this.op = "delete" as any; return this; }
  lt(k: string, v: any) { this.filters.push((r) => r[k] < v); return this; }
  or(expr: string) {
    // supports "section_id.is.null,section_id.eq.X"
    const parts = expr.split(",").map((p) => p.split("."));
    this.filters.push((r) => parts.some(([k, op, v]) => (op === "is" ? (r[k] ?? null) === null : r[k] === v)));
    return this;
  }
  order() { return this; }
  limit() { return this; }
  maybeSingle() { this.one = true; return this.run(); }
  single() { this.one = true; return this.run(); }
  then(res: any, rej: any) { return this.run().then(res, rej); }
  private join(r: Row): Row {
    if (!this.cols.includes("(")) return r;
    const out = { ...r };
    for (const [rel, fk] of [["shops", "shop_id"], ["sections", "section_id"], ["markets", "market_id"]]) {
      if (this.cols.includes(`${rel}(`)) {
        const found = (tables[rel] ?? []).find((x) => x.id === r[fk]) ?? null;
        // one nested level: shops(..., markets(...))
        out[rel] = found && rel === "shops" && /shops\([^)]*markets\(/.test(this.cols)
          ? { ...found, markets: (tables.markets ?? []).find((m) => m.id === found.market_id) ?? null }
          : found;
      }
    }
    return out;
  }
  async run() {
    const t = tables[this.table];
    if (this.op === "insert") {
      const rows = (Array.isArray(this.payload) ? this.payload : [this.payload!]).map((p) => ({
        id: id(), created_at: new Date().toISOString(), status: undefined, ...p,
      }));
      for (const r of rows) {
        if (r.status === undefined) delete r.status;
        if (this.table === "alerts") {
          r.status ??= "open"; r.current_tier ??= 0; r.ack_token ??= "tok" + r.id; r.hazard ??= "fire";
          if (t.some((a) => a.sensor_id === r.sensor_id && ["open", "acknowledged"].includes(a.status)))
            return { data: null, error: { code: "23505", message: "duplicate" } };
        }
        t.push(r);
      }
      return { data: this.one ? rows[0] : rows, error: null };
    }
    const hit = t.filter((r) => this.filters.every((f) => f(r)));
    if (this.op === "update") { hit.forEach((r) => Object.assign(r, this.payload)); return { data: hit, error: null }; }
    if ((this.op as string) === "delete") { tables[this.table] = t.filter((r) => !hit.includes(r)); return { data: hit, error: null }; }
    const data = hit.map((r) => this.join(r));
    if (this.one) return { data: data[0] ?? null, error: null };
    return { data, error: null };
  }
}

export const db = () => ({ from: (t: string) => new Q(t) });
