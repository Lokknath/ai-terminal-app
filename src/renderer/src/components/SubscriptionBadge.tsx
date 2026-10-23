export function SubscriptionBadge({ type }: { type?: string }): JSX.Element | null {
  if (!type) return null
  const normalized = type.toLowerCase()
  const isPro =
    normalized.includes('pro') ||
    normalized.includes('max') ||
    normalized.includes('plus') ||
    normalized.includes('team') ||
    normalized.includes('enterprise') ||
    normalized.includes('premium')
  const isFree = normalized.includes('free') || normalized.includes('basic')

  const label = isPro ? 'Pro' : isFree ? 'Free' : type.slice(0, 12)
  const color = isPro ? '#10b981' : isFree ? '#9ca3af' : '#8baeff'
  const bg = isPro
    ? 'rgba(16, 185, 129, 0.12)'
    : isFree
      ? 'rgba(107, 114, 128, 0.12)'
      : 'rgba(139, 174, 255, 0.12)'
  const border = isPro
    ? 'rgba(16, 185, 129, 0.35)'
    : isFree
      ? 'rgba(107, 114, 128, 0.25)'
      : 'rgba(139, 174, 255, 0.3)'

  return (
    <span
      style={{
        fontSize: '9px',
        fontWeight: 700,
        padding: '1px 5px',
        borderRadius: '4px',
        border: `1px solid ${border}`,
        backgroundColor: bg,
        color,
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
        flexShrink: 0
      }}
    >
      {label}
    </span>
  )
}

export default SubscriptionBadge
