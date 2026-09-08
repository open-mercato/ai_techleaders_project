import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "../../lib/utils"
import { Slot } from "radix-ui"

const badgeVariants = cva(
  "dm-badge",
  {
    variants: {
      variant: {
        default: "dm-badge-primary",
        secondary: "dm-badge-neutral",
        destructive: "dm-badge-error",
        success: "dm-badge-success",
        warning: "dm-badge-warning",
        information: "dm-badge-information",
        outline: "dm-badge-outline",
        ghost: "dm-badge-ghost",
        link: "dm-badge-link",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  size = "md",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean; size?: "sm" | "md" | "lg" }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      data-size={size}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
