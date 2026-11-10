/** Shown instead of a blank/broken page when the database query fails. */
export default function DbError({ message }: { message: string }) {
  const missingColumn = /column|does not exist|schema cache/i.test(message);
  return (
    <div className="space-y-2 rounded-lg border-2 border-red-700 bg-red-50 p-4 text-red-950">
      <h1 className="text-lg font-bold">This page couldn&apos;t load its data</h1>
      {missingColumn ? (
        <p>
          The database is missing the latest update. In Supabase → SQL Editor, run{" "}
          <code className="font-mono">002_home.sql</code> and then <code className="font-mono">003_nipost.sql</code>{" "}
          (both in <code className="font-mono">supabase/migrations</code>), then refresh.
        </p>
      ) : (
        <p>Check the Supabase keys in Vercel and that the project is running, then refresh.</p>
      )}
      <p className="font-mono text-sm">Error: {message}</p>
    </div>
  );
}
