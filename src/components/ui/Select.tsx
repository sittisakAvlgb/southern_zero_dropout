import { IconDown } from '../icons'

/** keeps the author's order while collapsing runs of the same group */
function groupOptions(options: Option[]): [string | undefined, Option[]][] {
  const out: [string | undefined, Option[]][] = []
  for (const o of options) {
    const last = out[out.length - 1]
    if (last && last[0] === o.group) last[1].push(o)
    else out.push([o.group, [o]])
  }
  return out
}

export interface Option {
  value: string
  label: string
  /** options sharing a group are rendered under one <optgroup> */
  group?: string
}

export function Select({
  label,
  value,
  onChange,
  options,
  className = '',
}: {
  label?: string
  value: string
  onChange: (v: string) => void
  options: Option[]
  className?: string
}) {
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      {label && (
        <span className="text-[11px] font-medium text-ink-muted">{label}</span>
      )}
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label}
          className="w-full appearance-none rounded-xl border border-surface-border bg-white py-2.5 pl-3 pr-9 text-sm font-medium text-ink outline-none transition-colors hover:border-brand-200 focus:border-brand-400"
        >
          {groupOptions(options).map(([group, rows]) =>
            group ? (
              <optgroup key={group} label={group}>
                {rows.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </optgroup>
            ) : (
              rows.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))
            ),
          )}
        </select>
        <IconDown
          width={16}
          height={16}
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint"
        />
      </div>
    </label>
  )
}
