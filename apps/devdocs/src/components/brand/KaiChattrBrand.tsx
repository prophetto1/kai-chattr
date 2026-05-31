type Props = {
  className?: string
  showLabel?: boolean
}

function joinClasses(...parts: Array<string | undefined>) {
  return parts.filter(Boolean).join(' ')
}

export function KaiChattrGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 44 44"
      aria-hidden="true"
      className={joinClasses('h-7 w-7 shrink-0 text-foreground', className)}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="5" y="5" width="15" height="15" rx="2" fill="currentColor" />
      <rect x="24" y="5" width="15" height="15" rx="2" fill="currentColor" fillOpacity="0.28" />
      <rect x="5" y="24" width="15" height="15" rx="2" fill="currentColor" fillOpacity="0.28" />
      <rect x="24" y="24" width="15" height="15" rx="2" fill="#2e6bff" />
    </svg>
  )
}

export function KaiChattrNavBrand({ className, showLabel = true }: Props) {
  return (
    <span className={joinClasses('inline-flex items-center gap-2 text-foreground', className)}>
      <KaiChattrGlyph className="h-6 w-6" />
      {showLabel ? (
        <span className="font-semibold tracking-[-0.02em]" aria-label="kai chattr docs">
          <span style={{ color: '#ff7a1a' }}>k</span>ai
          {' · '}
          chattr docs
        </span>
      ) : null}
    </span>
  )
}
