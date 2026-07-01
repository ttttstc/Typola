import { useEffect, useState } from 'react';
import {
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
};

export function Tooltip({
  label,
  shortcut,
  reference,
  placement = 'top',
}: TooltipProps) {
  const [open, setOpen] = useState(false);
  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement,
    middleware: [offset(8), flip({ padding: 8 }), shift({ padding: 8 })],
  });
  const hover = useHover(context, { delay: { open: 350, close: 0 } });
  const focus = useFocus(context);
  const role = useRole(context, { role: 'tooltip' });
  const { getFloatingProps } = useInteractions([hover, focus, role]);

  useEffect(() => {
    refs.setReference(reference);
  }, [reference, refs]);

  if (!reference || !open) {
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
