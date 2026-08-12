import { useId } from "react"

export type MiniChartDatum = {
  label: string
  value: number
  color?: string
}

function normalizedValues(data: MiniChartDatum[]) {
  const max = Math.max(...data.map((item) => item.value), 1)
  return data.map((item) => item.value / max)
}

export function MiniAreaChart({
  data,
  color = "var(--chart-1)",
  label,
}: {
  data: MiniChartDatum[]
  color?: string
  label: string
}) {
  const gradientId = useId().replaceAll(":", "")
  const values = normalizedValues(data)
  const points = values.map((value, index) => {
    const x = data.length === 1 ? 150 : (index / (data.length - 1)) * 300
    return [x, 76 - value * 58] as const
  })
  const line = points.map(([x, y], index) => `${index ? "L" : "M"}${x},${y}`).join(" ")
  const area = `${line} L300,82 L0,82 Z`

  return (
    <svg className="h-24 w-full overflow-visible" viewBox="0 0 300 96" role="img" aria-label={label}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0.03" />
        </linearGradient>
      </defs>
      {[24, 52, 80].map((y) => <line key={y} x1="0" x2="300" y1={y} y2={y} stroke="currentColor" className="text-border" />)}
      <path d={area} fill={`url(#${gradientId})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      {points.map(([x, y], index) => (
        <circle key={data[index].label} cx={x} cy={y} r="3" fill={color}>
          <title>{`${data[index].label}: ${data[index].value}`}</title>
        </circle>
      ))}
    </svg>
  )
}

export function MiniBarChart({
  data,
  color = "var(--chart-2)",
  label,
}: {
  data: MiniChartDatum[]
  color?: string
  label: string
}) {
  const values = normalizedValues(data)
  const slotWidth = 300 / Math.max(data.length, 1)
  const barWidth = Math.min(42, slotWidth * 0.58)

  return (
    <svg className="h-24 w-full overflow-visible" viewBox="0 0 300 96" role="img" aria-label={label}>
      <line x1="0" x2="300" y1="76" y2="76" stroke="currentColor" className="text-border" />
      {values.map((value, index) => {
        const height = Math.max(3, value * 58)
        const x = index * slotWidth + (slotWidth - barWidth) / 2
        return (
          <g key={data[index].label}>
            <rect x={x} y={76 - height} width={barWidth} height={height} rx="6" fill={color}>
              <title>{`${data[index].label}: ${data[index].value}`}</title>
            </rect>
            <text x={x + barWidth / 2} y="92" textAnchor="middle" className="fill-muted-foreground text-[9px]">
              {data[index].label.slice(0, 9)}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

export function MiniDonutChart({ data, label }: { data: MiniChartDatum[]; label: string }) {
  const total = data.reduce((sum, item) => sum + item.value, 0)
  let offset = 0
  const stops = data.map((item, index) => {
    const start = total > 0 ? (offset / total) * 360 : 0
    offset += item.value
    const end = total > 0 ? (offset / total) * 360 : index === 0 ? 360 : 0
    return `${item.color ?? `var(--chart-${(index % 5) + 1})`} ${start}deg ${end}deg`
  })

  return (
    <div
      className="relative size-24 shrink-0 rounded-full"
      style={{ background: total > 0 ? `conic-gradient(${stops.join(", ")})` : "var(--muted)" }}
      role="img"
      aria-label={label}
      title={data.map((item) => `${item.label}: ${item.value}`).join(", ")}
    >
      <div className="absolute inset-5 rounded-full bg-card" />
    </div>
  )
}
