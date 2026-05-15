export default function EditHabitLoading() {
  return (
    <div className="max-w-lg mx-auto min-h-screen p-4 animate-pulse">
      <header className="flex items-center justify-between py-4">
        <div className="h-5 w-14 rounded bg-zinc-200" />
        <div className="h-6 w-28 rounded bg-zinc-200" />
        <div className="h-5 w-12 rounded bg-zinc-200" />
      </header>
      <div className="space-y-6 mt-2">
        <div>
          <div className="h-4 w-12 rounded bg-zinc-200 mb-2" />
          <div className="h-12 w-full rounded-lg bg-zinc-100" />
        </div>
        <div>
          <div className="h-4 w-14 rounded bg-zinc-200 mb-2" />
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-10 w-10 rounded-full bg-zinc-100" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
