import { getSaturationLevel, nextSaturation, previousSaturation } from '../../services/defineColorSystem/constants';
import { randomizeDefineTheme } from '../../services/defineColorSystem/randomizeDefineTheme';
import type { DefineColorSettings } from '../../services/defineColorSystem/types';
import { GradientModeIcon } from './icons/GradientModeIcon';
import { SaturationDropIcon } from './icons/SaturationDropIcon';
import { SurpriseDiceIcon } from './icons/SurpriseDiceIcon';

export function DefineColorOptions({ settings, onCommit }: {
  settings: DefineColorSettings;
  onCommit: (patch: Partial<DefineColorSettings>) => void;
}) {
  const saturationLevel = getSaturationLevel(settings.saturation);
  const saturationLabel = saturationLevel === 'soft' ? '柔和' : saturationLevel === 'balanced' ? '平衡' : '浓郁';
  return (
    <div className="dc-options">
      <div className="dc-options-top">
          <button type="button" className="dc-round-control" aria-label="Toggle gradient mode" title={settings.isGradient ? 'Apply solid' : 'Apply gradient'} data-testid="define-gradient-toggle" onClick={() => onCommit({ isGradient: !settings.isGradient })}>
            <GradientModeIcon gradient={settings.isGradient} />
          </button>
          <button type="button" className="dc-round-control dc-saturation" aria-label={`切换饱和度，当前${saturationLabel}`} title={`饱和度：${saturationLabel}；单击前进，Shift+单击返回，键盘 1/2/3 直选`} data-testid="define-saturation-cycle" onClick={(event) => onCommit({ saturation: event.shiftKey ? previousSaturation(settings.saturation) : nextSaturation(settings.saturation) })} onKeyDown={(event) => {
            const saturation = event.key === '1' ? 24 : event.key === '2' ? 48 : event.key === '3' ? 72 : null;
            if (saturation === null) return;
            event.preventDefault();
            onCommit({ saturation });
          }}>
            <SaturationDropIcon level={saturationLevel} />
          </button>
      </div>
      <div className="dc-options-bottom">
          <button type="button" className="dc-dice-button" aria-label="Randomize theme" title="Surprise me" data-testid="define-randomize" onClick={() => onCommit(randomizeDefineTheme(settings))}>
            <SurpriseDiceIcon />
          </button>
      </div>
    </div>
  );
}
