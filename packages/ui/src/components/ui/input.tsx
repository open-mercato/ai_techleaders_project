import * as React from "react"
import { cn } from "../../lib/utils"

function Input({ className, type, fieldSize = 'md', ...props }: React.ComponentProps<"input"> & { fieldSize?: 'md' | 'sm' | 'xs' }) {
  return (
    <input
      type={type}
      data-slot="input"
      data-field-size={fieldSize}
      className={cn(
        "dm-input",
        className
      )}
      {...props}
    />
  )
}

export { Input }
