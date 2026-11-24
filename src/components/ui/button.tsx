import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50 min-h-11 px-4 cursor-pointer",
  {
    variants: {
      variant: {
        default: "bg-forest-700 text-white hover:bg-forest-800",
        secondary: "bg-paper text-forest-800 border border-forest-200 hover:bg-forest-50",
        ghost: "text-forest-800 hover:bg-forest-100",
        danger: "bg-danger text-white hover:bg-[#862515]",
        outlineDanger: "bg-paper text-danger border border-danger/40 hover:bg-danger-soft",
        link: "text-forest-700 underline underline-offset-4 min-h-0 px-0 hover:text-forest-900",
      },
      size: { default: "", sm: "min-h-9 px-3 text-sm", lg: "min-h-12 px-6 text-base", icon: "size-11 px-0" },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild, type, ...props }, ref) => {
  const Comp = asChild ? Slot : "button";
  return <Comp ref={ref} {...(!asChild ? { type: type ?? "button" } : {})} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
});
Button.displayName = "Button";
export { buttonVariants };
