import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> & {
  label: string;
  icon: ReactNode;
  pressed?: boolean;
  shortcut?: string;
  tooltip?: string | false;
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton({
  label,
  icon,
  pressed,
  shortcut,
  tooltip = label,
  className = '',
  type = 'button',
  ...props
}, ref) {
  return (
    <button
      {...props}
      ref={ref}
      type={type}
      className={`control-icon-button ${className}`.trim()}
      aria-label={label}
      aria-pressed={pressed}
      data-tooltip={tooltip || undefined}
      data-tooltip-shortcut={tooltip ? shortcut : undefined}
    >
      {icon}
    </button>
  );
});
