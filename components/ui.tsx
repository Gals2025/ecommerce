import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

// Single button system. Replaces the ad-hoc btnCls/btnDanger/btnPrimary locals
// and the 9 storefront literals: primary (pill, marketing/PDP/cart), secondary
// (rectangular form submit), outline (secondary actions), danger (destructive),
// utility/utilityDanger (small table/pagination actions).
export const buttonVariants = cva(
  "inline-flex items-center justify-center font-medium tracking-tight transition-all disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600/40",
  {
    variants: {
      variant: {
        primary: "rounded-full bg-emerald-700 text-white shadow-sm hover:bg-emerald-800 hover:shadow",
        secondary: "rounded-full bg-stone-900 text-white shadow-sm hover:bg-stone-700",
        outline: "rounded-full border border-stone-300 bg-white text-stone-700 shadow-sm hover:border-stone-400 hover:bg-stone-50",
        danger: "rounded-full border border-red-200 bg-white text-red-700 shadow-sm hover:bg-red-50",
        utility: "rounded-lg border border-stone-200 bg-white text-xs text-stone-600 shadow-sm hover:border-stone-300 hover:bg-stone-50",
        utilityDanger: "rounded-lg border border-red-200 bg-white text-xs text-red-600 shadow-sm hover:bg-red-50",
        link: "text-sm font-medium text-emerald-800 underline-offset-4 hover:underline",
      },
      size: {
        xs: "px-2.5 py-1 text-xs",
        sm: "px-3.5 py-1.5 text-sm",
        md: "px-5 py-2.5 text-sm",
        lg: "px-6 py-3 text-sm",
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
  return <div className={cn("rounded-2xl border border-stone-200/80 bg-white p-5 shadow-soft", className)} {...props} />;
}

const fieldBase =
  "w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-base text-stone-900 shadow-sm outline-none transition placeholder:text-stone-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20 disabled:opacity-50 sm:text-sm";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(fieldBase, className)} {...props} />;
}

export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(fieldBase, "pr-8", className)} {...props} />;
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(fieldBase, className)} {...props} />;
}
