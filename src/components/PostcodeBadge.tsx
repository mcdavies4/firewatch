const STYLE: Record<string, { text: string; cls: string }> = {
  verified: { text: "✓ NIPOST verified", cls: "bg-emerald-100 text-emerald-900 border-emerald-700" },
  not_found: { text: "✗ Not found on NIPOST", cls: "bg-red-100 text-red-900 border-red-700" },
  invalid_format: { text: "✗ Invalid postcode", cls: "bg-red-100 text-red-900 border-red-700" },
  unchecked: { text: "Format OK · not yet checked with NIPOST", cls: "bg-amber-100 text-amber-900 border-amber-700" },
};

/** Postcode plus its NIPOST verification state, e.g. "EK-01-A03-FK-01 ✓ NIPOST verified". */
export default function PostcodeBadge({
  postcode,
  status,
  detail,
}: {
  postcode: string | null;
  status: string | null;
  detail?: string | null;
}) {
  if (!postcode) {
    return (
      <span className="inline-block rounded border border-zinc-400 bg-zinc-100 px-2 py-0.5 text-sm text-zinc-800">
        No NIPOST postcode yet
      </span>
    );
  }
  const s = STYLE[status ?? "unchecked"] ?? STYLE.unchecked;
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className="rounded bg-zinc-900 px-2 py-0.5 font-mono text-sm font-bold tracking-wide text-white">{postcode}</span>
      <span className={`rounded border px-2 py-0.5 text-sm font-semibold ${s.cls}`}>{s.text}</span>
      {detail && <span className="text-sm text-zinc-700">{detail}</span>}
    </span>
  );
}
