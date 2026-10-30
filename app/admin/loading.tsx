export default function AdminLoading() {
  return (
    <div className="animate-pulse space-y-8">
      <div className="mb-2 h-10 w-1/4 rounded bg-gray-200"></div>
      <div className="h-4 w-2/4 rounded bg-gray-200"></div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="card flex h-28 flex-col justify-between">
            <div className="h-4 w-1/2 rounded bg-gray-200"></div>
            <div className="h-8 w-1/3 rounded bg-gray-200"></div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="card h-96 lg:col-span-2"></div>
        <div className="card h-96"></div>
      </div>
    </div>
  );
}
