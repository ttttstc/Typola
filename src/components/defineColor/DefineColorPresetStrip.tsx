import { DEFINE_PRESETS } from '../../services/defineColorSystem/presets';
import type { DefineColorSettings } from '../../services/defineColorSystem/types';

const color = (value: { l: number; c: number; h: number }) => `oklch(${value.l} ${value.c} ${value.h})`;

export function DefineColorPresetStrip({ onSelect }: { onSelect: (patch: Partial<DefineColorSettings>) => void }) {
  return (
    <div className="dc-presets" aria-label="主题预设">
      {DEFINE_PRESETS.map((preset, index) => {
        const isGradient = preset.colors.length > 1;
        const selected = preset.colors[isGradient ? 1 : 0];
        return (
          <button
            key={preset.name}
            type="button"
            className="dc-preset"
            aria-label={`预设 ${index + 1}`}
            data-testid={`define-preset-${index}`}
            style={{ background: isGradient ? `linear-gradient(135deg, ${preset.colors.map(color).join(', ')})` : color(selected) }}
            onClick={() => onSelect({ ...selected, isGradient, saturation: selected.c < .001 ? 0 : 72, currentPresetIndex: index })}
          />
        );
      })}
    </div>
  );
}
