import { useCallback } from 'react';

export function usePatternOpacitySlider(onPreview: (value: number) => void, onCommit: (value: number) => void) {
  const valueAt = useCallback((element: HTMLElement, clientX: number) => {
    const rect = element.getBoundingClientRect();
    return Math.round(Math.min(1, Math.max(0, (clientX - rect.left - 16) / Math.max(1, rect.width - 32))) * 100);
  }, []);
  const onPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    onPreview(valueAt(event.currentTarget.parentElement ?? event.currentTarget, event.clientX));
  }, [onPreview, valueAt]);
  const onPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      onPreview(valueAt(event.currentTarget.parentElement ?? event.currentTarget, event.clientX));
    }
  }, [onPreview, valueAt]);
  const finish = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const value = valueAt(event.currentTarget.parentElement ?? event.currentTarget, event.clientX);
    event.currentTarget.releasePointerCapture(event.pointerId);
    onCommit(value);
  }, [onCommit, valueAt]);
  return { onPointerDown, onPointerMove, onPointerUp: finish, onPointerCancel: finish };
}
