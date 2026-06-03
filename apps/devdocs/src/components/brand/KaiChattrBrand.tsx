import { SITE_NAME } from '@/config/site'

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
      {/* KAI MonogramK (kai-brand-marks.jsx) — K is the lead in the orange tile; A·I as layer pins */}
      <rect width="44" height="44" rx="7.9" fill="var(--kai-brand-k)" />
      <g fill="var(--bd-on-brand)">
        <rect x="11.44" y="9.68" width="5.72" height="24.64" />
        <polygon points="18.48,22 32.56,9.68 32.56,15.84 24.2,22 32.56,28.16 32.56,34.32 18.48,22" />
      </g>
      <circle cx="34.32" cy="34.32" r="2.2" fill="var(--kai-brand-a)" />
      <circle cx="38.72" cy="34.32" r="2.2" fill="var(--kai-brand-i)" />
    </svg>
  )
}

export function KaiChattrNavBrand({ className, showLabel = true }: Props) {
  return (
    <span className={joinClasses('inline-flex items-center gap-2 text-foreground', className)}>
      <KaiChattrGlyph className="h-6 w-6" />
      {showLabel ? (
        <span className="font-semibold tracking-[-0.02em]" aria-label={SITE_NAME}>
          <span className="text-[var(--kai-brand-k)]">k</span>ai
          {' · '}
          chattr docs
        </span>
      ) : null}
    </span>
  )
}
