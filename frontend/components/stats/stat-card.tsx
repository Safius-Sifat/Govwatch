/**
 * Single KPI card — label + big number. Used in the stats dashboard and
 * the home page sidebar.
 */
export function StatCard({
  label,
  value,
  hint,
  accent = 'default',
}: {
  label: string
  value: string | number
  hint?: string
  accent?: 'default' | 'red' | 'green'
}) {
  const accentClass =
    accent === 'red'
      ? 'bg-red-500/5 border-red-500/30'
      : accent === 'green'
      ? 'bg-emerald-500/5 border-emerald-500/30'
      : 'bg-card border'

  return (
    <div className={`rounded-lg border p-3 ${accentClass}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  )
}
