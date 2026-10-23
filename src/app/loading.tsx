export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="card animate-pulse">
      <span className="sr-only">Memuat…</span>
      <div aria-hidden="true" className="h-6 w-1/3 rounded bg-canvas" />
      <div aria-hidden="true" className="mt-4 h-4 w-2/3 rounded bg-canvas" />
      <div aria-hidden="true" className="mt-2 h-4 w-1/2 rounded bg-canvas" />
    </div>
  );
}
