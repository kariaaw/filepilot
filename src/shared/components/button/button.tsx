import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import clsx from 'clsx';

import styles from '@/shared/components/button/button.module.css';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export type ButtonSize = 'small' | 'medium' | 'large';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * Defines the semantic visual importance of the action.
   */
  variant?: ButtonVariant;

  /**
   * Controls the button height and horizontal spacing.
   */
  size?: ButtonSize;

  /**
   * Expands the button to fill the width of its parent container.
   */
  fullWidth?: boolean;

  /**
   * Prevents repeated interaction and displays an activity indicator.
   */
  isLoading?: boolean;

  /**
   * Accessible label announced while an asynchronous action is running.
   */
  loadingLabel?: string;

  children: ReactNode;
}

/**
 * Shared FilePilot button primitive.
 *
 * Native button behavior is preserved so keyboard interaction, form
 * submission, focus handling, and assistive technologies work correctly.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    children,
    className,
    disabled,
    fullWidth = false,
    isLoading = false,
    loadingLabel = 'Loading',
    size = 'medium',
    type = 'button',
    variant = 'secondary',
    ...buttonProps
  },
  ref,
) {
  const isDisabled = disabled || isLoading;

  return (
    <button
      {...buttonProps}
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-busy={isLoading || undefined}
      aria-label={
        isLoading ? (buttonProps['aria-label'] ?? loadingLabel) : buttonProps['aria-label']
      }
      className={clsx(
        styles.button,
        styles[size],
        styles[variant],
        fullWidth && styles.fullWidth,
        isLoading && styles.loading,
        className,
      )}
    >
      {isLoading && <span className={styles.spinner} aria-hidden="true" />}

      <span className={isLoading ? styles.loadingContent : undefined}>{children}</span>
    </button>
  );
});

Button.displayName = 'Button';
