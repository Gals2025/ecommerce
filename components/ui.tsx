import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

// Single button system. Replaces the ad-hoc btnCls/btnDanger/btnPrimary locals
// and the 9 storefront literals: primary (pill, marketing/PDP/cart), secondary
// (rectangular form submit), outline (secondary actions), danger (destructive),
// utility/utilityDanger (small table/pagination actions).
export const buttonVariants = cva(
  "inline-flex items-center justify-center font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "rounded-full bg-black text-white hover:bg-gray-800",
        secondary: "rounded-md bg-black text-white hover:bg-gray-800",
        outline: "rounded-md border hover:bg-gray-50",
        danger: "rounded-md border border-red-300 text-red-700 hover:bg-red-50",
        utility: "rounded border text-xs hover:bg-gray-50",
        utilityDanger: "rounded border text-xs text-red-600 hover:bg-red-50",
        link: "text-sm text-gray-600 underline-offset-2 hover:underline",
      },
      size: {
        xs: "px-2 py-1 text-xs",
        sm: "px-3 py-1.5 text-sm",
        md: "px-4 py-2 text-sm",
        lg: "px-5 py-2.5 text-sm",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  }
);

export function Button({
  className,
  variant,
  size,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-lg border p-4", className)} {...props} />;
}

const fieldBase =
  "w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-gray-400 disabled:opacity-50";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(fieldBase, className)} {...props} />;
}

export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(fieldBase, "pr-8", className)} {...props} />;
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(fieldBase, className)} {...props} />;
}
