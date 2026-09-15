"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui";

export function Dialog({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const prevFocus = useRef<Element | null>(null);
  useEffect(() => {
    if (!open) return;
    prevFocus.current = document.activeElement;
    // Focus the panel for keyboard users; restore focus on close.
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      (prevFocus.current as HTMLElement | null)?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-stone-950/40 backdrop-blur-[2px]" onClick={onClose} />
      <div ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-lift outline-none">
        <h2 className="font-display text-xl font-semibold tracking-tight">{title}</h2>
        <div className="mt-3">{children}</div>
      </div>
    </div>
  );
}

export function ConfirmationDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  tone = "default",
  pending = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  tone?: "default" | "danger";
  pending?: boolean;
}) {
  const descId = useId();
  return (
    <Dialog open={open} onClose={onClose} title={title}>
      {description && <p id={descId} className="text-sm text-stone-500">{description}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button
          variant={tone === "danger" ? "danger" : "secondary"}
          onClick={onConfirm}
          disabled={pending}
        >
          {pending ? "Working…" : confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}

/**
 * Destructive-action trigger for server-action forms. Renders a button that
 * opens a confirmation dialog; confirming submits the form by id. The form
 * itself (with hidden inputs) stays in the server component.
 */
export function ConfirmButton({
  form,
  title,
  description,
  confirmLabel,
  children,
  name,
  value,
}: {
  form: string;
  title: string;
  description?: string;
  confirmLabel?: string;
  children: React.ReactNode;
  /** Optional submit-button name/value appended to the form on confirm. */
  name?: string;
  value?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant="danger" onClick={() => setOpen(true)}>
        {children}
      </Button>
      <ConfirmationDialog
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        description={description}
        confirmLabel={confirmLabel}
        tone="danger"
        onConfirm={() => {
          setOpen(false);
          const el = document.getElementById(form) as HTMLFormElement | null;
          if (!el) return;
          if (name !== undefined) {
            let hidden = el.querySelector<HTMLInputElement>(`input[type="hidden"][data-confirm="${name}"]`);
            if (!hidden) {
              hidden = document.createElement("input");
              hidden.type = "hidden";
              hidden.dataset.confirm = name;
              el.appendChild(hidden);
            }
            hidden.name = name;
            hidden.value = value ?? "";
          }
          el.requestSubmit();
        }}
      />
    </>
  );
}
