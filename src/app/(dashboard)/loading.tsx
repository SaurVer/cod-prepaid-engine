// Shown instantly while a page's data loads, so moving between tabs never feels stuck.
export default function Loading() {
  const bar = 'animate-pulse rounded-lg bg-panel';
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading">
      <div className={`${bar} h-8 w-64`} />
      <div className="grid grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card h-[104px] px-4 py-3.5">
            <div className={`${bar} h-3 w-24`} />
            <div className={`${bar} mt-3 h-7 w-28`} />
          </div>
        ))}
      </div>
      <div className="card space-y-3 p-5">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className={`${bar} h-5`} style={{ width: `${90 - i * 7}%` }} />
        ))}
      </div>
    </div>
  );
}
