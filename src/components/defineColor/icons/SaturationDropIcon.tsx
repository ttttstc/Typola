import { useId } from 'react';
import type { DefineSaturationLevel } from '../../../services/defineColorSystem/constants';

export function SaturationDropIcon({ level }: { level: DefineSaturationLevel }) {
  const clipY = level === 'soft' ? 12 : level === 'balanced' ? 8.5 : 1;
  const clipId = useId();
  return (
    <svg className={`dc-saturation-icon is-${level}`} width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <defs><clipPath id={clipId}><rect x="2" y={clipY} width="14" height={16 - clipY} /></clipPath></defs>
      <path d="M7.53 2.08a1.65 1.65 0 0 1 2.94 0l4.14 7.15A5.18 5.18 0 0 1 9 16.95a5.18 5.18 0 0 1-5.61-7.72l4.14-7.15Z" fill="none" stroke="currentColor" strokeWidth="1.45" strokeOpacity=".72" />
      <path d="M7.53 2.08a1.65 1.65 0 0 1 2.94 0l4.14 7.15A5.18 5.18 0 0 1 9 16.95a5.18 5.18 0 0 1-5.61-7.72l4.14-7.15Z" fill="currentColor" fillOpacity={level === 'soft' ? '.28' : level === 'balanced' ? '.56' : '.84'} clipPath={`url(#${clipId})`} />
      {level === 'vivid' && <path d="M9 3.4v2M5.7 5.1l1.4 1.4M12.3 5.1l-1.4 1.4" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />}
    </svg>
  );
}
