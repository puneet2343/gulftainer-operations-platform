/** Loading placeholders. All use the mist-2 grey with Tailwind's pulse. */

export function TableSkeleton({ rows = 7, columns = 6 }: { rows?: number; columns?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, row) => (
        <tr key={row} className="border-b border-gray-100">
          {Array.from({ length: columns }).map((__, col) => (
            <td key={col} className="px-4 py-3.5">
              <div className={`h-4 animate-pulse rounded bg-gray-100 ${col === 0 ? 'w-40' : col === columns - 1 ? 'ml-auto w-16' : 'w-24'}`} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export function CardSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading" className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3 md:gap-3">
      {Array.from({ length: count }).map((_, i) => <div key={i} className="h-[108px] animate-pulse rounded-xl bg-gray-100" />)}
    </div>
  );
}

export function MobileCardSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-2.5 p-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border border-gray-200 bg-white p-3.5">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 animate-pulse rounded-full bg-gray-100" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-2/3 animate-pulse rounded bg-gray-100" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-gray-100" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function LineSkeleton({ width = 'w-28' }: { width?: string }) {
  return <span className={`inline-block h-4 ${width} animate-pulse rounded-full bg-gray-200`} aria-label="Loading" />;
}

/** Whole-page placeholder shown until the operations database has loaded on the client. */
export function PageSkeleton() {
  return (
    <div className="animate-pulse space-y-5" aria-busy="true" aria-label="Loading">
      <div className="space-y-2">
        <div className="h-3 w-24 rounded bg-gray-200" />
        <div className="h-8 w-64 rounded bg-gray-200" />
        <div className="h-4 w-96 max-w-full rounded bg-gray-100" />
      </div>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[1, 2, 3, 4].map(i => <div key={i} className="h-[92px] rounded-[15px] border border-gray-200 bg-white" />)}
      </div>
      <div className="h-[420px] rounded-[16px] border border-gray-200 bg-white" />
    </div>
  );
}
