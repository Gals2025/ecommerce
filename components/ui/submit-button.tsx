"use client";
import { useFormStatus } from "react-dom";
import { Button, buttonVariants } from "@/components/ui";
import type { VariantProps } from "class-variance-authority";

/** Submit button with automatic pending state for server-action forms. */
export function SubmitButton({
  pendingLabel,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & { pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button disabled={pending} {...props}>
      {pending && pendingLabel ? pendingLabel : children}
    </Button>
  );
}
