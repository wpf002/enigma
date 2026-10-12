export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <div className="h-3 w-32 rounded-sm bg-sunken" />
      <div className="mt-3 h-8 w-96 max-w-full rounded-sm bg-sunken" />
      <div className="mt-12 grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => <div key={i} className="card h-24" />)}
      </div>
      <p className="sr-only">Loading</p>
    </div>
  );
}
