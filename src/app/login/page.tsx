export default function LoginPage({
  searchParams,
}: {
  searchParams?: { error?: string };
}) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col items-center justify-center px-6 py-10">
        <div className="w-full max-w-md rounded-2xl border bg-white p-8 shadow-lg dark:border-slate-800 dark:bg-slate-900">
          <h1 className="text-2xl font-semibold">Auth disabled</h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Authentication is currently turned off. Go back to the app.
          </p>
          <a
            href="/"
            className="mt-6 inline-flex w-full items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
          >
            Go to app
          </a>
        </div>
      </div>
    </div>
  );
}
