import { useCallback, useRef } from 'react';

const clamp = (value: number) => Math.min(100, Math.max(0, value));

export function useDragSaturation(value: number, onPreview: (value: number) => void, onCommit: (value: number) => void) {
  const start = useRef({ y: 0, value });
  const calculate = useCallback((clientY: number) => clamp(start.current.value + ((start.current.y - clientY) / 180) * 100), []);
  const onPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    start.current = { y: event.clientY, value };
    event.currentTarget.setPointerCapture(event.pointerId);
  }, [value]);
  const onPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) onPreview(calculate(event.clientY));
  }, [calculate, onPreview]);
  const finish = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const next = calculate(event.clientY);
    event.currentTarget.releasePointerCapture(event.pointerId);
    onCommit(next);
  }, [calculate, onCommit]);
  return { onPointerDown, onPointerMove, onPointerUp: finish, onPointerCancel: finish };
}
