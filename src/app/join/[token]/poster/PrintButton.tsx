"use client";

export default function PrintButton() {
  return (
    <button onClick={() => window.print()} className="mt-8 rounded-lg bg-zinc-900 px-6 py-3 font-bold text-white print:hidden">
      Print poster
    </button>
  );
}
