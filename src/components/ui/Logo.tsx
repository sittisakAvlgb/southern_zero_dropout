/**
 * The Southern Zero Dropout mark.
 *
 * The artwork sits on a transparent background and its palette (bright blue,
 * green, orange) holds up on the navy chrome, so it is placed bare — no plate,
 * no ring. `plate` is kept for the rare light-on-light surface.
 */
export function Logo({
  size = 48,
  plate = false,
  className = '',
}: {
  size?: number
  /** white rounded tile behind the mark, for light-on-light surfaces */
  plate?: boolean
  className?: string
}) {
  const img = (
    <img
      src="/logo.png"
      alt="Southern Zero Dropout"
      className="block h-full w-full object-contain"
      draggable={false}
    />
  )

  return (
    <span
      className={`inline-grid shrink-0 place-items-center ${
        plate ? 'overflow-hidden rounded-xl bg-white p-1 shadow-sm ring-1 ring-black/5' : ''
      } ${className}`}
      style={{ width: size, height: size }}
    >
      {img}
    </span>
  )
}
