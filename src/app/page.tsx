import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Firewatch — fire and carbon monoxide alerts for Nigerian markets and homes",
  description:
    "Sensors detect smoke, heat and carbon monoxide. Firewatch calls and texts the right people in seconds, with the building's NIPOST digital postcode, and escalates until someone responds.",
};

const CONTACT = "mailto:the36thltd@outlook.com?subject=Firewatch%20pilot";

function Flame({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <rect width="64" height="64" rx="14" fill="#dc2626" />
      <path
        fill="#fff"
        d="M33.5 8c1.6 7.6-2.4 11.4-6.2 15.4-3.9 4-7.8 8.2-7.8 15 0 9.3 6.1 16.6 13.6 16.6 7.8 0 13.4-6.5 13.4-15.2 0-6.4-3-10.6-5.6-14.2-.3 3.5-1.8 6.1-4.1 7.4.8-8.1-.4-17.6-3.3-25z"
      />
      <path
        fill="#fde047"
        d="M32.6 33.5c-3.4 3.6-5.6 6.3-5.6 10.2 0 4 2.6 6.9 5.9 6.9 3.4 0 5.8-2.9 5.8-6.6 0-3.1-1.6-5.2-3.1-7-.4 1.7-1.3 2.8-2.4 3.3.1-2.4 0-4.6-.6-6.8z"
      />
    </svg>
  );
}

const STEPS = [
  {
    n: "1",
    title: "Sensor detects",
    body: "Smoke, heat or carbon monoxide in a shop or home. It works through power cuts on battery backup.",
  },
  {
    n: "2",
    title: "Calls and texts in seconds",
    body: "The owner, night security or family get a call and SMS with the building's NIPOST postcode, landmark and map pin.",
  },
  {
    n: "3",
    title: "Escalates until someone answers",
    body: "Nobody presses 1 within a minute? Firewatch moves up the chain to marshals, the union, estate security and the fire service.",
  },
  {
    n: "4",
    title: "Everyone knows who's on it",
    body: "When one person responds, everyone else is told. The response time is recorded for every alert.",
  },
];

export default function Landing() {
  return (
    <div className="bg-white text-zinc-900">
      {/* Nav */}
      <header className="border-b border-zinc-200">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4">
          <div className="flex items-center gap-2">
            <Flame />
            <span className="text-xl font-extrabold tracking-tight">Firewatch</span>
          </div>
          <nav className="flex items-center gap-3 text-sm font-semibold sm:gap-5 sm:text-base">
            <a href="#how" className="hidden hover:underline sm:inline">How it works</a>
            <a href="#nipost" className="hidden hover:underline sm:inline">NIPOST postcode</a>
            <Link href="/dashboard" className="rounded-lg border-2 border-zinc-900 px-3 py-1.5 hover:bg-zinc-900 hover:text-white">
              Sign in
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-zinc-950 text-white">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 py-14 md:grid-cols-[1.2fr_1fr] md:py-20">
          <div>
            <p className="mb-4 inline-block rounded-full bg-yellow-300 px-3 py-1 text-sm font-bold text-zinc-950">
              Built on NIPOST&apos;s digital postcode
            </p>
            <h1 className="text-4xl leading-tight font-extrabold sm:text-5xl">
              When fire starts at 2am, <span className="text-red-500">someone gets the call.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg text-zinc-200">
              Firewatch connects smoke, heat and carbon monoxide sensors in Nigerian markets and homes to phone calls and
              SMS. The alert reaches the right people within seconds, with the building&apos;s exact NIPOST postcode, and
              keeps escalating until someone responds.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href={CONTACT} className="rounded-lg bg-red-600 px-5 py-3 text-lg font-bold hover:bg-red-700">
                Request a pilot
              </a>
              <a href="#how" className="rounded-lg border-2 border-white px-5 py-3 text-lg font-bold hover:bg-white hover:text-zinc-950">
                See how it works
              </a>
            </div>
          </div>

          {/* Phone mock: the actual alert text */}
          <div className="mx-auto w-full max-w-sm rounded-[2.2rem] border-8 border-zinc-700 bg-zinc-100 p-4 text-zinc-900 shadow-2xl">
            <div className="mb-3 text-center text-sm font-semibold text-zinc-700">Messages · FIREWATCH</div>
            <div className="rounded-2xl rounded-tl-sm bg-white p-3 text-[15px] leading-snug shadow">
              <b className="text-red-600">FIRE ALERT</b>: smoke/heat at Shop C14, Line C, Main Market,{" "}
              <b className="font-mono whitespace-nowrap">NIPOST EK-01-A03-FK-01</b>. Go now. Tap to confirm you&apos;re responding:{" "}
              <span className="text-blue-700 underline">firewatch…/ack/7f3a</span>
            </div>
            <div className="mt-2 rounded-2xl rounded-tl-sm bg-white p-3 text-[15px] leading-snug shadow">
              <b>UPDATE</b>: Musa (night security) is responding to the fire alert at Shop C14.
            </div>
            <div className="mt-3 rounded-2xl bg-purple-700 p-3 text-[15px] leading-snug text-white shadow">
              <b>CARBON MONOXIDE ALERT</b> at Mum&apos;s house, Enugu. Get everyone out, open doors and windows, switch off
              the generator.
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="mx-auto max-w-6xl px-5 py-16">
        <h2 className="text-3xl font-extrabold">How it works</h2>
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s) => (
            <div key={s.n} className="rounded-xl border-2 border-zinc-200 p-5">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-600 text-lg font-extrabold text-white">
                {s.n}
              </div>
              <h3 className="mt-4 text-lg font-bold">{s.title}</h3>
              <p className="mt-2 text-zinc-800">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Two editions */}
      <section className="bg-zinc-100">
        <div className="mx-auto grid max-w-6xl gap-6 px-5 py-16 md:grid-cols-2">
          <div className="rounded-xl bg-white p-6 shadow-sm">
            <div className="text-3xl">🏪</div>
            <h2 className="mt-2 text-2xl font-extrabold">Firewatch Markets</h2>
            <p className="mt-2 text-zinc-800">For market associations, unions and state governments.</p>
            <ul className="mt-4 space-y-2 text-zinc-900">
              <li>✓ A sensor in each shop or cluster, linked to the shop&apos;s own postcode</li>
              <li>✓ Live map of the whole market, with every shop shown as a tile</li>
              <li>✓ Owner and night security first, then marshals, union and fire service</li>
              <li>✓ Fire-safety audits and a certificate traders can show</li>
              <li>✓ Fire drills and marshal training</li>
            </ul>
          </div>
          <div className="rounded-xl bg-white p-6 shadow-sm">
            <div className="text-3xl">🏠</div>
            <h2 className="mt-2 text-2xl font-extrabold">Firewatch Home</h2>
            <p className="mt-2 text-zinc-800">For families, including children abroad looking after parents.</p>
            <ul className="mt-4 space-y-2 text-zinc-900">
              <li>✓ Smoke and carbon monoxide alarm, so generator fumes are caught too</li>
              <li>✓ Alerts go to the household, family abroad, a neighbour and estate security</li>
              <li>✓ Texts the family if the alarm goes offline</li>
              <li>✓ The exact building, landmark and map pin in every alert</li>
            </ul>
          </div>
        </div>
      </section>

      {/* NIPOST */}
      <section id="nipost" className="mx-auto max-w-6xl px-5 py-16">
        <div className="grid items-center gap-8 md:grid-cols-2">
          <div>
            <h2 className="text-3xl font-extrabold">Every alert points to one building</h2>
            <p className="mt-4 text-lg text-zinc-800">
              &ldquo;Fire at the market&rdquo; isn&apos;t enough to find the right shop at night. Every home and shop in
              Firewatch carries its <b>NIPOST digital postcode</b>, checked against NIPOST when it&apos;s registered, or
              found from a map pin. The postcode goes into every call, text and responder page, so people go straight to
              the right building.
            </p>
          </div>
          <div className="rounded-xl border-4 border-zinc-900 p-6 text-center">
            <div className="text-sm font-bold tracking-widest text-zinc-700 uppercase">NIPOST postcode</div>
            <div className="mt-2 font-mono text-3xl font-extrabold tracking-wide whitespace-nowrap sm:text-4xl">EK-01-A03-FK-01</div>
            <div className="mt-3 inline-block rounded border-2 border-emerald-700 bg-emerald-100 px-3 py-1 font-bold text-emerald-900">
              ✓ NIPOST verified building
            </div>
            <div className="mt-4 grid grid-cols-5 gap-1 text-xs font-semibold text-zinc-700 sm:text-sm">
              <div>State</div>
              <div>LGA</div>
              <div>District</div>
              <div>Area</div>
              <div>Building</div>
            </div>
          </div>
        </div>
      </section>

      {/* Credibility + CTA */}
      <section className="bg-red-600 text-white">
        <div className="mx-auto max-w-6xl px-5 py-14 text-center">
          <h2 className="text-3xl font-extrabold">Built by an approved fire safety trainer</h2>
          <p className="mx-auto mt-3 max-w-2xl text-lg text-red-50">
            Firewatch is designed around how fires actually start and spread in markets and homes, and around how people
            respond to them, from the first call to the drill.
          </p>
          <a
            href={CONTACT}
            className="mt-7 inline-block rounded-lg bg-white px-6 py-3 text-lg font-extrabold text-red-700 hover:bg-red-50"
          >
            Talk to us about a pilot
          </a>
        </div>
      </section>

      <footer className="border-t border-zinc-200">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-6 text-sm text-zinc-700">
          <div className="flex items-center gap-2">
            <Flame className="h-5 w-5" />
            <span>Firewatch by The 36th Solutions Ltd, Abuja</span>
          </div>
          <div className="flex gap-4">
            <a href={CONTACT} className="hover:underline">the36thltd@outlook.com</a>
            <Link href="/dashboard" className="hover:underline">Sign in</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
