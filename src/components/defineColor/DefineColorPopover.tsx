import type { DefineColorSettings } from '../../services/defineColorSystem/types';
import { DefineColorOptions } from './DefineColorOptions';
import { DefineColorPatternSlider } from './DefineColorPatternSlider';
import { DefineColorPresetStrip } from './DefineColorPresetStrip';
import { DefineColorWheel } from './DefineColorWheel';

export function DefineColorPopover({ settings, onPreview, onCommit }: {
  settings: DefineColorSettings;
  onPreview: (patch: Partial<DefineColorSettings>) => void;
  onCommit: (patch: Partial<DefineColorSettings>) => void;
}) {
  return (
    <div className="dc-editor" data-testid="define-color-editor">
      <div className="dc-editor-content">
        <div className="dc-wheel-layer"><DefineColorWheel settings={settings} onPreview={onPreview} onCommit={onCommit} /></div>
        <DefineColorOptions settings={settings} onCommit={onCommit} />
      </div>
      <DefineColorPresetStrip onSelect={onCommit} />
      <DefineColorPatternSlider settings={settings} onPreview={onPreview} onCommit={onCommit} />
    </div>
  );
}
