import { env } from "@/lib/env";

/** Shows a shop/home's panic button link to send to the owner. */
export default function PanicLink({ token }: { token: string | null }) {
  if (!token) return null;
  const url = `${env.appUrl()}/panic/${token}`;
  return (
    <div className="rounded-lg border-2 border-red-700 bg-white p-3">
      <div className="font-semibold">🆘 Panic button (no sensor needed)</div>
      <p className="text-sm text-zinc-800">
        Send this link to the owner. They save it to their phone&apos;s home screen; two taps raise a real alert with the
        postcode.
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <code className="break-all rounded bg-zinc-100 px-2 py-1 text-sm">{url}</code>
        <a href={url} target="_blank" className="rounded bg-red-600 px-3 py-1.5 text-sm font-semibold text-white">
          Open
        </a>
      </div>
    </div>
  );
}
