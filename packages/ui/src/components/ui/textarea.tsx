import * as React from "react"
import { cn } from "../../lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "dm-input dm-textarea",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
