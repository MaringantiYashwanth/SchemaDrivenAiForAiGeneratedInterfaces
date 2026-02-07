export default async function AdminPage() {
  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-10">
      <div className="rounded-xl border bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h1 className="text-2xl font-semibold">Admin Console</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          Only admin users can access this route. Use it to manage schemas or
          review generated interfaces.
        </p>
      </div>
    </div>
  );
}
