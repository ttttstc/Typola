export function GradientModeIcon({ gradient }: { gradient: boolean }) {
  return <span className="dc-gradient-icon" aria-hidden="true">{gradient ? <span className="dc-gradient-dots">•••</span> : <span className="dc-gradient-solid" />}</span>;
}
