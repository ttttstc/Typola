import { useEffect, useState } from 'react';
import {
  autoUpdate,
  FloatingPortal,
  flip,
  offset,
  shift,
  useFloating,
  useFocus,
  useHover,
  useInteractions,
  useRole,
  type Placement,
} from '@floating-ui/react';

type TooltipProps = {
  label: string;
  shortcut?: string;
  reference: HTMLElement | null;
  placement?: Placement;
  open?: boolean;
};

export function Tooltip({
  label,
  shortcut,
  reference,
  placement = 'top',
  open: controlledOpen,
}: TooltipProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setUncontrolledOpen,
    placement,
    middleware: [offset(8), flip({ padding: 8 }), shift({ padding: 8 })],
    // 布局变化(面板开合/标签增删导致 anchor 位移)时跟随重算,
    // 否则 tooltip 停留在旧坐标,表现为"卡在屏幕上"。
    whileElementsMounted: autoUpdate,
  });
  const hover = useHover(context, { delay: { open: 350, close: 0 } });
  const focus = useFocus(context);
  const role = useRole(context, { role: 'tooltip' });
  const { getFloatingProps } = useInteractions([hover, focus, role]);

  useEffect(() => {
    refs.setReference(reference);
  }, [reference, refs]);

  // anchor 已从 DOM 移除时(按钮重渲染/卸载)直接不渲染——
  // 失去 anchor 的 floating 会回落到视口左上角(0,0),即"卡死的 tooltip"。
  if (!reference || !reference.isConnected || !open || !label) {
    return null;
  }

  return (
    <FloatingPortal>
      <div
        ref={refs.setFloating}
        className="typola-floating-tooltip"
        style={{ ...floatingStyles, zIndex: 9999 }}
        {...getFloatingProps()}
      >
        <span className="typola-floating-tooltip-label">{label}</span>
        {shortcut && <span className="typola-floating-tooltip-shortcut">{shortcut}</span>}
      </div>
    </FloatingPortal>
  );
}
