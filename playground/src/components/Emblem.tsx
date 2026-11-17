import { BLADE, LAYOUT, SHIELD } from './emblem-layout'

export function Emblem({ size, label }: { size: number; label?: string }) {
  const box = (k: keyof typeof LAYOUT) => ({
    left: `${LAYOUT[k].x * 100}%`,
    top: `${LAYOUT[k].y * 100}%`,
    width: `${LAYOUT[k].s * 100}%`,
  })
  return (
    <span
      className="emblem"
      style={{ width: size, height: size }}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <img src={SHIELD} alt="" style={box('shield')} />
      <img src={BLADE} alt="" style={box('blade')} />
    </span>
  )
}
