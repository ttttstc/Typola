import { Check } from 'lucide-react';
import { useMemo, useState } from 'react';
import { DEFINE_PRESETS } from '../../services/defineColorSystem/presets';
import type { DefineColorSettings } from '../../services/defineColorSystem/types';

const color = (value: { l: number; c: number; h: number }) => `oklch(${value.l} ${value.c} ${value.h})`;
const CURATED_PRESET_INDICES = [0, 2, 4, 6, 8, 10, 24, 36] as const;

function presetLabel(name: string, index: number): string {
  if (name === 'gray-heavy') return '深灰';
  if (name === 'gray-light') return '浅灰';
  const gradient = name.endsWith('-gradient');
  const tone = name.startsWith('heavy') ? '浓郁' : '柔和';
  return `${tone}${gradient ? '渐变' : '纯色'} ${index + 1}`;
}

export function DefineColorPresetStrip({
  currentPresetIndex,
  onSelect,
}: {
  currentPresetIndex: number | null;
  onSelect: (patch: Partial<DefineColorSettings>) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const visibleIndices = useMemo(() => {
    if (showAll) return DEFINE_PRESETS.map((_, index) => index);
    const curated: number[] = [...CURATED_PRESET_INDICES];
    if (currentPresetIndex !== null && !curated.includes(currentPresetIndex)) {
      curated[curated.length - 1] = currentPresetIndex;
    }
    return curated;
  }, [currentPresetIndex, showAll]);

  return (
    <div className="dc-presets-section">
      <div className="dc-presets-header">
        <span>主题预设</span>
        <button
          type="button"
          aria-expanded={showAll}
          onClick={() => setShowAll((current) => !current)}
        >
          {showAll ? '收起' : `全部 ${DEFINE_PRESETS.length}`}
        </button>
      </div>
      <div className={`dc-presets ${showAll ? 'expanded' : ''}`} aria-label="主题预设">
        {visibleIndices.map((index) => {
          const preset = DEFINE_PRESETS[index];
          const isGradient = preset.colors.length > 1;
          const selected = preset.colors[isGradient ? 1 : 0];
          const active = currentPresetIndex === index;
          return (
            <button
              key={preset.name}
              type="button"
              className={`dc-preset ${active ? 'selected' : ''}`}
              aria-label={presetLabel(preset.name, index)}
              aria-pressed={active}
              data-testid={`define-preset-${index}`}
              style={{ background: isGradient ? `linear-gradient(135deg, ${preset.colors.map(color).join(', ')})` : color(selected) }}
              onClick={() => onSelect({ ...selected, isGradient, saturation: selected.c < .001 ? 0 : 72, currentPresetIndex: index })}
            >
              {active && <Check size={12} strokeWidth={2.2} aria-hidden="true" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
