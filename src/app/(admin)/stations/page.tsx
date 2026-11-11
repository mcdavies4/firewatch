import { db } from "@/lib/supabase";
import { createStation, toggleStation } from "@/app/actions";
import DbError from "@/components/DbError";

export const dynamic = "force-dynamic";

const input = "w-full rounded border p-2 text-sm";

export default async function Stations() {
  const { data, error } = await db().from("fire_stations").select("*").order("state").order("lga");
  if (error) return <DbError message={error.message} />;
  const tier = Number(process.env.FIRE_STATION_TIER ?? 2);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">🚒 Fire stations</h1>
        <p className="text-zinc-800">
          When nobody has responded by <b>tier {tier}</b>, Firewatch calls and texts the fire station for the
          alert&apos;s <b>local government area</b> (taken from the building&apos;s NIPOST postcode). If none is listed
          for that LGA, it uses the stations listed for the whole state (leave LGA blank for those).
        </p>
      </div>

      <form action={createStation} className="grid max-w-3xl gap-2 rounded-lg border bg-white p-4 sm:grid-cols-2">
        <input name="name" required placeholder="Station name, e.g. Ikeja Fire Station" className={input} />
        <input name="phone" required placeholder="Direct line (0803… or +234…)" className={input} />
        <input name="state" required placeholder="State, e.g. Lagos" className={input} />
        <input name="lga" placeholder="LGA, e.g. Ikeja (blank = whole state)" className={input} />
        <button className="rounded bg-zinc-900 px-3 py-2 text-sm font-semibold text-white sm:col-span-2">
          Add fire station
        </button>
      </form>

      <table className="w-full rounded-lg bg-white text-sm shadow-sm">
        <thead className="bg-zinc-100 text-left">
          <tr>
            <th className="p-2">Station</th>
            <th className="p-2">Phone</th>
            <th className="p-2">State</th>
            <th className="p-2">LGA</th>
            <th className="p-2" />
          </tr>
        </thead>
        <tbody>
          {(data ?? []).map((st) => (
            <tr key={st.id} className={`border-t ${st.active ? "" : "opacity-40"}`}>
              <td className="p-2 font-medium">{st.name}</td>
              <td className="p-2">{st.phone}</td>
              <td className="p-2">{st.state}</td>
              <td className="p-2">{st.lga ?? "Whole state"}</td>
              <td className="p-2 text-right">
                <form action={toggleStation}>
                  <input type="hidden" name="id" value={st.id} />
                  <input type="hidden" name="active" value={String(!st.active)} />
                  <button className="text-sm font-medium underline">{st.active ? "Disable" : "Enable"}</button>
                </form>
              </td>
            </tr>
          ))}
          {!data?.length && (
            <tr>
              <td colSpan={5} className="p-4 text-zinc-700">
                No stations yet. Add the direct lines of the stations covering your pilot market.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
