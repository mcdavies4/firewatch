import Link from "next/link";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <header className="sticky top-0 z-10 border-b bg-white">
        <nav className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3 text-sm">
          <span className="font-bold text-red-600">🔥 Firewatch</span>
          <Link href="/dashboard" className="hover:underline">Dashboard</Link>
          <Link href="/alerts" className="hover:underline">Alerts</Link>
          <Link href="/setup" className="hover:underline">Setup</Link>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
