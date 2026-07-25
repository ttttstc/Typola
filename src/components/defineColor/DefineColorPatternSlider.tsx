import transparentPattern from '../../assets/define-color/transparent-pattern.png';
import { usePatternOpacitySlider } from '../../hooks/usePatternOpacitySlider';
import { DEFINE_PATTERN_URLS, nextPattern } from '../../services/defineColorSystem/patterns';
import type { DefineColorSettings } from '../../services/defineColorSystem/types';

const PATTERN_LABELS: Record<DefineColorSettings['pattern'], string> = {
  none: '无图案',
  stripe: '条纹',
  liquid: '流体',
  warp: '波纹',
  noise: '噪点',
  starlight: '星光',
  dots: '圆点',
  'dots-2': '细点',
  define: 'Define',
};

export function DefineColorPatternSlider({ settings, onPreview, onCommit }: {
  settings: DefineColorSettings;
  onPreview: (patch: Partial<DefineColorSettings>) => void;
  onCommit: (patch: Partial<DefineColorSettings>) => void;
}) {
  const handlers = usePatternOpacitySlider(
    (patternOpacity) => onPreview({ patternOpacity }),
    (patternOpacity) => onCommit({ patternOpacity }),
  );
  const commitOpacity = (value: number) => {
    onCommit({ patternOpacity: Math.min(100, Math.max(0, value)) });
  };
  return (
    <div className="dc-controls">
      <div className="dc-pattern-slider" style={{ backgroundImage: `url("${transparentPattern}")` }}>
        <button
          type="button"
          className="dc-pattern-preview"
          aria-label={`切换图案，当前${PATTERN_LABELS[settings.pattern]}`}
          data-testid="define-pattern-cycle"
          style={{ backgroundImage: DEFINE_PATTERN_URLS[settings.pattern], opacity: settings.patternOpacity / 100 }}
          onClick={() => onCommit({ pattern: nextPattern(settings.pattern) })}
        />
        <div
          className="dc-pattern-knob"
          role="slider"
          tabIndex={0}
          aria-label="图案不透明度"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(settings.patternOpacity)}
          aria-valuetext={`${Math.round(settings.patternOpacity)}%`}
          style={{ left: `calc(4px + (100% - 32px) * ${settings.patternOpacity / 100})` }}
          onKeyDown={(event) => {
            const step = event.shiftKey ? 10 : 5;
            if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') commitOpacity(settings.patternOpacity - step);
            else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') commitOpacity(settings.patternOpacity + step);
            else if (event.key === 'Home') commitOpacity(0);
            else if (event.key === 'End') commitOpacity(100);
            else return;
            event.preventDefault();
          }}
          {...handlers}
        ><span /><span /></div>
      </div>
    </div>
  );
}
