import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const buttonStyles = cva('dm-button', {
  variants: {
    intent: {
      primary: 'dm-button-primary',
      neutral: 'dm-button-neutral',
      error: 'dm-button-error',
    },
    appearance: {
      filled: 'dm-button-filled',
      stroke: 'dm-button-stroke',
      lighter: 'dm-button-lighter',
      ghost: 'dm-button-ghost',
    },
    size: {
      md: 'dm-button-md',
      sm: 'dm-button-sm',
      xs: 'dm-button-xs',
      xxs: 'dm-button-xxs',
    },
    iconOnly: { true: 'dm-button-icon' },
    link: { true: 'dm-button-link' },
  },
});

const legacyVariants = {
  default: { intent: 'primary', appearance: 'filled' },
  destructive: { intent: 'error', appearance: 'filled' },
  outline: { intent: 'neutral', appearance: 'stroke' },
  secondary: { intent: 'neutral', appearance: 'lighter' },
  ghost: { intent: 'neutral', appearance: 'ghost' },
  link: { intent: 'primary', appearance: 'ghost' },
} as const;

const buttonSizes = {
  md: 'md', sm: 'sm', xs: 'xs', xxs: 'xxs',
  default: 'sm', lg: 'md', icon: 'sm',
} as const;

interface ButtonVariantOptions
  extends Pick<VariantProps<typeof buttonStyles>, 'intent' | 'appearance' | 'iconOnly'> {
  /** Compatibility aliases. Explicit intent and appearance override each independently. */
  variant?: keyof typeof legacyVariants | null;
  size?: keyof typeof buttonSizes | null;
  className?: string;
  class?: string;
}

function buttonVariants({
  variant, intent, appearance, size, iconOnly, className, class: classValue,
}: ButtonVariantOptions = {}) {
  const legacy = legacyVariants[variant ?? 'default'];
  return cn(buttonStyles({
    intent: intent ?? legacy.intent,
    appearance: appearance ?? legacy.appearance,
    size: buttonSizes[size ?? 'md'],
    iconOnly: iconOnly || size === 'icon',
    link: variant === 'link' && appearance == null,
  }), classValue, className);
}

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    Omit<ButtonVariantOptions, 'class' | 'className'> {
  asChild?: boolean;
  /** For asChild, compose icons inside the single slotted element instead. */
  leadingIcon?: React.ReactNode;
  trailingIcon?: React.ReactNode;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, intent, appearance, size, iconOnly, asChild = false,
    leadingIcon, trailingIcon, children, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    const directChildren = asChild || iconOnly || size === 'icon';
    return (
      <Comp
        className={buttonVariants({ variant, intent, appearance, size, iconOnly, className })}
        ref={ref}
        {...props}
      >
        {directChildren ? children : <>
          {leadingIcon != null && <span className="dm-button-icon-slot" aria-hidden="true">{leadingIcon}</span>}
          <span className="dm-button-label">{children}</span>
          {trailingIcon != null && <span className="dm-button-icon-slot" aria-hidden="true">{trailingIcon}</span>}
        </>}
      </Comp>
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
