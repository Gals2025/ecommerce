import { NextResponse } from "next/server";
import { addToCart } from "@/actions/catalog";

// Progressive-enhancement endpoint for product-page <form method="post">.
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const variantId = String(form.get("variantId") ?? "");
    const qty = Number(form.get("qty") ?? 1);
    if (!variantId) throw new Error("Missing variant");
    await addToCart(variantId, Math.max(1, Math.min(99, qty || 1)));
    // Fixed path on our own origin only: the Referer host is attacker-influenced.
    return NextResponse.redirect(new URL("/cart", process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"), 303);
  } catch (err) {
    const msg = (err as Error).message;
    // Never echo raw internals: map to generic, user-safe messages.
    const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 400;
    const safe = status === 400 ? "Invalid request" : msg;
    return NextResponse.json({ error: safe }, { status });
  }
}
