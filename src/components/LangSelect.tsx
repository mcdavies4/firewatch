import { LANGS } from "@/lib/i18n";

/** Alert language picker for forms. */
export default function LangSelect({
  name = "language",
  defaultValue = "en",
  className = "w-full rounded border p-2 text-sm",
}: {
  name?: string;
  defaultValue?: string;
  className?: string;
}) {
  return (
    <select name={name} defaultValue={defaultValue} className={className} aria-label="Alert language">
      {LANGS.map((l) => (
        <option key={l.code} value={l.code}>
          Alerts in {l.label}
        </option>
      ))}
    </select>
  );
}
