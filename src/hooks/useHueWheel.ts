import { useCallback, useEffect, useRef } from 'react';
import { normalizeHue } from '../services/defineColorSystem/presets';

type HueWheelOptions = {
  onPreview: (h: number) => void;
  onCommit: (h: number) => void;
  onVisual?: (h: number) => void;
};

export function useHueWheel({ onPreview, onCommit, onVisual }: HueWheelOptions) {
  const dragRect = useRef<DOMRect | null>(null);
  const isDragging = useRef(false);
  const pendingHue = useRef<number | null>(null);
  const frame = useRef<number | null>(null);
  const angleFromPointer = useCallback((rect: DOMRect, clientX: number, clientY: number) => {
    return normalizeHue(Math.atan2(clientY - (rect.top + rect.height / 2), clientX - (rect.left + rect.width / 2)) * 180 / Math.PI);
  }, []);

  const flushPreview = useCallback(() => {
    frame.current = null;
    const hue = pendingHue.current;
    pendingHue.current = null;
    if (hue === null) return;
    onPreview(hue);
  }, [onPreview, onVisual]);

  const queuePreview = useCallback((hue: number) => {
    onVisual?.(hue);
    pendingHue.current = hue;
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(flushPreview);
  }, [flushPreview, onVisual]);

  useEffect(() => () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
  }, []);

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    isDragging.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRect.current = event.currentTarget.getBoundingClientRect();
    queuePreview(angleFromPointer(dragRect.current, event.clientX, event.clientY));
  }, [angleFromPointer, queuePreview]);
  const onPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId) || !dragRect.current) return;
    queuePreview(angleFromPointer(dragRect.current, event.clientX, event.clientY));
  }, [angleFromPointer, queuePreview]);
  const finish = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId) || !dragRect.current) return;
    const hue = angleFromPointer(dragRect.current, event.clientX, event.clientY);
    dragRect.current = null;
    isDragging.current = false;
    event.currentTarget.releasePointerCapture(event.pointerId);
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    pendingHue.current = null;
    onVisual?.(hue);
    onCommit(hue);
  }, [angleFromPointer, onCommit, onVisual]);
  return { isDragging, onPointerDown, onPointerMove, onPointerUp: finish, onPointerCancel: finish };
}
