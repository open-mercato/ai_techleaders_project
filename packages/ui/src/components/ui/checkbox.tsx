"use client"

import * as React from "react"
import { cn } from "../../lib/utils"
import { CheckIcon, MinusIcon } from "lucide-react"
import { Checkbox as CheckboxPrimitive } from "radix-ui"

function Checkbox({
  className,
  size = 'md',
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root> & { size?: 'md' | 'sm' }) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      data-size={size}
      className={cn(
        "dm-checkbox-control",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="dm-checkbox-indicator"
      >
        <CheckIcon className="dm-check-mark" aria-hidden="true" />
        <MinusIcon className="dm-mixed-mark" aria-hidden="true" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
