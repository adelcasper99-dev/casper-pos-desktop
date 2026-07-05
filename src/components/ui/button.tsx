import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"
import { useLicense } from "@/contexts/LicenseContext"

const buttonVariants = cva(
    "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
    {
        variants: {
            variant: {
                default: "bg-primary text-primary-foreground hover:bg-primary/90",
                destructive:
                    "bg-destructive text-destructive-foreground hover:bg-destructive/90",
                outline:
                    "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
                secondary:
                    "bg-secondary text-secondary-foreground hover:bg-secondary/80",
                ghost: "hover:bg-accent hover:text-accent-foreground",
                link: "text-primary underline-offset-4 hover:underline",
            },
            size: {
                default: "h-11 px-5 py-2", // Increased for touch (was h-9)
                sm: "h-10 rounded-md px-4 text-xs", // Bumping up for touch (was h-9)
                lg: "h-13 rounded-md px-8 text-lg", // Larger
                icon: "h-12 w-12", // Larger touch target (was h-11)
                xs: "h-7 px-2 text-[10px] uppercase tracking-wider font-bold",
            },
        },
        defaultVariants: {
            variant: "default",
            size: "default",
        },
    }
)

export interface ButtonProps
    extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
    asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant, size, asChild = false, type, disabled, ...props }, ref) => {
        const Comp = asChild ? Slot : "button"
        
        let { isReadOnly } = { isReadOnly: false };
        try {
            // eslint-disable-next-line react-hooks/rules-of-hooks
            const context = useLicense();
            isReadOnly = context.isReadOnly;
        } catch (e) {
            // Context might not be available
        }

        const shouldDisable = disabled || (isReadOnly && type === 'submit');

        return (
            <Comp
                className={cn(buttonVariants({ variant, size, className }))}
                ref={ref}
                type={type}
                disabled={shouldDisable}
                title={shouldDisable && isReadOnly ? "Disabled in Read-Only Mode" : props.title}
                {...props}
            />
        )
    }
)
Button.displayName = "Button"

export { Button, buttonVariants }
