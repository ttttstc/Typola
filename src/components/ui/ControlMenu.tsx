/* eslint-disable react-hooks/refs -- Floating UI navigation uses mutable item refs by design. */
import {
  FloatingFocusManager,
  FloatingPortal,
  flip,
  offset,
  shift,
  useClick,
  useDismiss,
  useFloating,
  useInteractions,
  useListNavigation,
  useRole,
  useTypeahead,
  type Placement,
} from '@floating-ui/react';
import { Check, ChevronDown } from 'lucide-react';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { IconButton } from './IconButton';

export type ControlMenuItem = {
  id: string;
  label: string;
  onSelect: () => void;
  active?: boolean;
  selection?: 'checkbox' | 'radio';
  disabled?: boolean;
  icon?: ReactNode;
  shortcut?: string;
  description?: string;
};

type ControlMenuProps = {
  label: string;
  icon: ReactNode;
  items: readonly ControlMenuItem[];
  active?: boolean;
  disabled?: boolean;
  placement?: Placement;
  className?: string;
  shortcut?: string;
  triggerClassName?: string;
  menuClassName?: string;
  itemClassName?: string;
  showChevron?: boolean;
};

export function ControlMenu({
  label,
  icon,
  items,
  active = false,
  disabled = false,
  placement = 'bottom-start',
  className = '',
  shortcut,
  triggerClassName = '',
  menuClassName = '',
  itemClassName = '',
  showChevron = true,
}: ControlMenuProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<Array<HTMLButtonElement | null>>([]);
  const labelsRef = useRef(items.map((item) => item.label));
  labelsRef.current = items.map((item) => item.label);

  const disabledIndices = useMemo(
    () => items.flatMap((item, index) => item.disabled ? [index] : []),
    [items],
  );
  const selectedIndex = items.findIndex((item) => item.active && !item.disabled);
  const floating = useFloating({
    open,
    onOpenChange: (nextOpen) => {
      setOpen(nextOpen);
      if (nextOpen) {
        const firstEnabled = items.findIndex((item) => !item.disabled);
        setActiveIndex(selectedIndex >= 0 ? selectedIndex : firstEnabled >= 0 ? firstEnabled : null);
      } else {
        triggerRef.current?.focus();
      }
    },
    placement,
    middleware: [offset(4), flip({ padding: 8 }), shift({ padding: 8 })],
  });
  const click = useClick(floating.context);
  const dismiss = useDismiss(floating.context, { escapeKey: true, outsidePress: true });
  const role = useRole(floating.context, { role: 'menu' });
  const listNavigation = useListNavigation(floating.context, {
    listRef,
    activeIndex,
    onNavigate: setActiveIndex,
    disabledIndices,
    loop: true,
  });
  const typeahead = useTypeahead(floating.context, {
    listRef: labelsRef,
    activeIndex,
    onMatch: setActiveIndex,
  });
  const { getReferenceProps, getFloatingProps, getItemProps } = useInteractions([
    click,
    dismiss,
    role,
    listNavigation,
    typeahead,
  ]);

  return (
    <div className={`control-menu-root ${className}`.trim()}>
      <IconButton
        ref={(node) => {
          triggerRef.current = node;
          floating.refs.setReference(node);
        }}
        label={label}
        shortcut={shortcut}
        icon={(
          <>
            {icon}
            {showChevron && <ChevronDown className="control-menu-chevron" size={10} strokeWidth={1.6} aria-hidden="true" />}
          </>
        )}
        className={`${active ? 'active' : ''} ${triggerClassName}`.trim()}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="menu"
        data-no-window-drag="true"
        {...getReferenceProps()}
      />
      {open && (
        <FloatingPortal>
          <FloatingFocusManager context={floating.context} modal={false} returnFocus>
            <div
              ref={floating.refs.setFloating}
              className={`control-menu ${menuClassName}`.trim()}
              style={floating.floatingStyles}
              aria-label={label}
              {...getFloatingProps()}
            >
              {items.map((item, index) => {
                const selection = item.selection
                  ?? (typeof item.active === 'boolean' ? 'checkbox' : undefined);
                return (
                  <button
                    key={item.id}
                    ref={(node) => {
                      listRef.current[index] = node;
                    }}
                    type="button"
                    role={selection ? `menuitem${selection}` : 'menuitem'}
                    aria-checked={selection ? Boolean(item.active) : undefined}
                    className={`${item.active ? 'active' : ''} ${itemClassName}`.trim()}
                    disabled={item.disabled}
                    tabIndex={activeIndex === index ? 0 : -1}
                    {...getItemProps({
                      onClick: () => {
                        setOpen(false);
                        triggerRef.current?.focus();
                        item.onSelect();
                      },
                    })}
                  >
                    <span className="control-menu-item-mark" aria-hidden="true">
                      {item.active ? <Check size={14} strokeWidth={1.8} /> : item.icon}
                    </span>
                    <span className="control-menu-item-copy">
                      <span className="control-menu-item-label">{item.label}</span>
                      {item.description && <span className="control-menu-item-description">{item.description}</span>}
                    </span>
                    {item.shortcut && <kbd>{item.shortcut}</kbd>}
                  </button>
                );
              })}
            </div>
          </FloatingFocusManager>
        </FloatingPortal>
      )}
    </div>
  );
}
