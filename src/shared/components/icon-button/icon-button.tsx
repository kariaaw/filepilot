import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import clsx from 'clsx';

import styles from '@/shared/components/icon-button/icon-button.module.css';

export type IconButtonVariant = 'ghost' | 'secondary' | 'primary' | 'danger';

export type IconButtonSize = 'small' | 'medium' | 'large';

export interface IconButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'aria-label' | 'children'
> {
  /**
   * Accessible name announced by assistive technologies.
   *
   * Icon-only buttons have no visible text, so this property is required.
   */
  'aria-label': string;

  /**
   * Visual icon displayed inside the button.
   */
  icon: ReactNode;

  /**
   * Controls the semantic visual importance of the action.
   */
  variant?: IconButtonVariant;

  /**
   * Controls the square dimensions of the button.
   */
  size?: IconButtonSize;

  /**
   * Marks toggle-style controls as currently selected.
   */
  isActive?: boolean;
}

/**
 * Accessible icon-only button for FilePilot toolbars and navigation.
 *
 * Native button behavior is preserved for keyboard interaction, focus
 * management, disabled states, and assistive technologies.
 */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  {
    'aria-label': ariaLabel,
    className,
    disabled,
    icon,
    isActive = false,
    size = 'medium',
    title,
    type = 'button',
    variant = 'ghost',
    ...buttonProps
  },
  ref,
) {
  return (
    <button
      {...buttonProps}
      ref={ref}
      type={type}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-pressed={buttonProps['aria-pressed'] ?? (isActive ? true : undefined)}
      title={title ?? ariaLabel}
      className={clsx(
        styles.iconButton,
        styles[size],
        styles[variant],
        isActive && styles.active,
        className,
      )}
    >
      <span className={styles.icon} aria-hidden="true">
        {icon}
      </span>
    </button>
  );
});

IconButton.displayName = 'IconButton';
