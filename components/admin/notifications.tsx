"use client";
import { useState } from "react";

export function NotificationsButton() {
  // Placeholder: popover seam for a future notifications service.
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Notifications"
        className="rounded-md border px-2 py-1 text-sm"
      >
        🔔
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-64 rounded-md border bg-white p-4 text-sm shadow-lg">
          <div className="font-medium">Notifications</div>
          <p className="mt-1 text-xs text-gray-500">No notifications yet. Low-stock and payment alerts will appear here.</p>
        </div>
      )}
    </div>
  );
}
