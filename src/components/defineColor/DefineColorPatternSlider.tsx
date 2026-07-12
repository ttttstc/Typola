import transparentPattern from '../../assets/define-color/transparent-pattern.png';
import { usePatternOpacitySlider } from '../../hooks/usePatternOpacitySlider';
import { DEFINE_PATTERN_URLS, nextPattern } from '../../services/defineColorSystem/patterns';
import type { DefineColorSettings } from '../../services/defineColorSystem/types';

export function DefineColorPatternSlider({ settings, onPreview, onCommit }: {
  settings: DefineColorSettings;
  onPreview: (patch: Partial<DefineColorSettings>) => void;
  onCommit: (patch: Partial<DefineColorSettings>) => void;
}) {
  const handlers = usePatternOpacitySlider(
    (patternOpacity) => onPreview({ patternOpacity }),
    (patternOpacity) => onCommit({ patternOpacity }),
  );
  return (
    <div className="dc-controls">
      <div className="dc-pattern-slider" style={{ backgroundImage: `url("${transparentPattern}")` }}>
        <button
          type="button"
          className="dc-pattern-preview"
          aria-label={`切换图案，当前 ${settings.pattern}`}
          data-testid="define-pattern-cycle"
          style={{ backgroundImage: DEFINE_PATTERN_URLS[settings.pattern], opacity: settings.patternOpacity / 100 }}
          onClick={() => onCommit({ pattern: nextPattern(settings.pattern) })}
        />
        <div
          className="dc-pattern-knob"
          role="slider"
          aria-label="图案不透明度"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(settings.patternOpacity)}
          style={{ left: `calc(4px + (100% - 32px) * ${settings.patternOpacity / 100})` }}
          {...handlers}
        ><span /><span /></div>
      </div>
    </div>
  );
}
