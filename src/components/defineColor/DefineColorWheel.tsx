import { useCallback, useRef } from 'react';
import { GRADIENT_OFFSET_DEG, WHEEL_RADIUS } from '../../services/defineColorSystem/constants';
import { colorAtHue, pointAtAngle } from '../../services/defineColorSystem/presets';
import type { DefineColorSettings } from '../../services/defineColorSystem/types';
import { useHueWheel } from '../../hooks/useHueWheel';

export function DefineColorWheel({ settings, onPreview, onCommit }: {
  settings: DefineColorSettings;
  onPreview: (patch: Partial<DefineColorSettings>) => void;
  onCommit: (patch: Partial<DefineColorSettings>) => void;
}) {
  const center = 156;
  const wheelRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLSpanElement>(null);
  const auxiliaryRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const visualHue = useRef(settings.h);
  const renderedSettingsHue = useRef(settings.h);
  const colorPatch = useCallback((h: number) => ({ ...colorAtHue(h), currentPresetIndex: null }), []);
  const paintWheel = useCallback((h: number) => {
    visualHue.current = h;
    const point = pointAtAngle(h, WHEEL_RADIUS, center, center);
    const maskSize = settings.isGradient ? 280 : 232;
    const color = colorAtHue(h);
    if (wheelRef.current) wheelRef.current.style.maskPosition = `${point.x - maskSize / 2}px ${point.y - maskSize / 2}px`;
    if (handleRef.current) {
      handleRef.current.style.left = `${point.x}px`;
      handleRef.current.style.top = `${point.y}px`;
      handleRef.current.style.background = `oklch(${color.l} ${color.c * settings.saturation / 100} ${color.h})`;
    }
    if (settings.isGradient) {
      [h - GRADIENT_OFFSET_DEG, h + GRADIENT_OFFSET_DEG].forEach((angle, index) => {
        const handle = auxiliaryRefs.current[index];
        const auxiliaryPoint = pointAtAngle(angle, WHEEL_RADIUS, center, center);
        const auxiliaryColor = colorAtHue(angle);
        if (!handle) return;
        handle.style.left = `${auxiliaryPoint.x}px`;
        handle.style.top = `${auxiliaryPoint.y}px`;
        handle.style.background = `oklch(${auxiliaryColor.l} ${auxiliaryColor.c * settings.saturation / 100} ${auxiliaryColor.h})`;
      });
    }
  }, [settings.isGradient, settings.saturation]);
  const { isDragging, ...handlers } = useHueWheel({
    onVisual: paintWheel,
    onPreview: (h) => onPreview(colorPatch(h)),
    onCommit: (h) => onCommit(colorPatch(h)),
  });
  if (!isDragging.current && renderedSettingsHue.current !== settings.h) visualHue.current = settings.h;
  renderedSettingsHue.current = settings.h;
  const displayHue = visualHue.current;
  const main = pointAtAngle(displayHue, WHEEL_RADIUS, center, center);
  const auxiliary = [displayHue - GRADIENT_OFFSET_DEG, displayHue + GRADIENT_OFFSET_DEG]
    .map((angle) => ({ point: pointAtAngle(angle, WHEEL_RADIUS, center, center), color: colorAtHue(angle) }));
  const current = colorAtHue(displayHue);
  const maskSize = settings.isGradient ? 280 : 232;
  return (
    <div className="dc-wheel-shell">
      <div className="dc-wheel-content">
        <div
          className={`dc-wheel ${settings.isGradient ? 'is-gradient' : ''}`}
          ref={wheelRef}
          style={{ maskSize: `${maskSize}px ${maskSize}px`, maskPosition: `${main.x - maskSize / 2}px ${main.y - maskSize / 2}px` }}
          {...handlers}
        >
          {settings.isGradient && auxiliary.map(({ point, color }, index) => (
            <span key={index} ref={(node) => { auxiliaryRefs.current[index] = node; }} className="dc-wheel-handle auxiliary" style={{ left: point.x, top: point.y, background: `oklch(${color.l} ${color.c * settings.saturation / 100} ${color.h})` }} />
          ))}
          <span ref={handleRef} className="dc-wheel-handle" data-testid="define-hue-handle" style={{ left: main.x, top: main.y, background: `oklch(${current.l} ${current.c * settings.saturation / 100} ${current.h})` }} />
        </div>
      </div>
    </div>
  );
}
