import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/** Public certificate check — print the URL as a QR code on the shop's certificate. */
export default async function Cert({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const { data } = await db()
    .from("audits")
    .select("certificate_code, valid_until, score, auditor_name, created_at, shops(shop_number, owner_name, markets(name))")
    .eq("certificate_code", code.toUpperCase())
    .maybeSingle();

  if (!data) {
    return <main className="mx-auto max-w-md p-6"><h1 className="text-xl font-bold text-red-600">Certificate not found</h1></main>;
  }

  const cert = data as unknown as {
    certificate_code: string;
    valid_until: string;
    score: number;
    auditor_name: string;
    created_at: string;
    shops: { shop_number: string; owner_name: string; markets: { name: string } | null } | null;
  };
  const valid = new Date(cert.valid_until) >= new Date();

  return (
    <main className="mx-auto max-w-md p-6">
      <div className={`rounded-xl border-4 p-6 text-center ${valid ? "border-emerald-600" : "border-zinc-400"}`}>
        <div className="text-sm uppercase tracking-widest text-zinc-600">Firewatch Fire Safety Certificate</div>
        <div className={`my-3 text-3xl font-bold ${valid ? "text-emerald-700" : "text-zinc-600"}`}>
          {valid ? "VALID" : "EXPIRED"}
        </div>
        <div className="text-lg font-semibold">Shop {cert.shops?.shop_number}</div>
        <div>{cert.shops?.owner_name}</div>
        <div className="text-zinc-700">{cert.shops?.markets?.name}</div>
        <div className="mt-4 text-sm text-zinc-700">
          Score {cert.score}% · Audited by {cert.auditor_name} on {new Date(cert.created_at).toLocaleDateString("en-GB")}
          <br />
          Valid until {new Date(cert.valid_until).toLocaleDateString("en-GB")} · Code {cert.certificate_code}
        </div>
      </div>
    </main>
  );
}
