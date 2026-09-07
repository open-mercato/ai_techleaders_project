"use client"

import * as React from "react"
import { cn } from "../../lib/utils"
import { Progress as ProgressPrimitive } from "radix-ui"

function Progress({
  className,
  value,
  max = 100,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  const limit = Number.isFinite(max) && max > 0 ? max : 100
  const current = typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= limit ? value : null
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      value={current}
      max={limit}
      className={cn("dm-progress", className)}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className="dm-progress-indicator"
        style={{ transform: `translateX(-${100 - ((current ?? 0) / limit) * 100}%)` }}
      />
    </ProgressPrimitive.Root>
  )
}

export { Progress }
