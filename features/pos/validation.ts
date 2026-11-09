import { z } from "zod";

export const posSaleSchema = z.object({
  key: z.string().uuid(),
  locationId: z.string().uuid(),
  customerName: z.string().trim().max(120).default(""),
  notes: z.string().trim().max(1000).default(""),
  method: z.enum(["pay_at_store", "gcash_manual", "bank_transfer"]),
  reference: z.string().trim().max(120).default(""),
  expectedTotal: z.number().int().min(0).max(2147483647),
  tendered: z.number().int().min(0).max(2147483647),
  items: z.array(z.object({ variantId: z.string().uuid(), qty: z.number().int().min(1).max(999) })).min(1).max(100),
}).superRefine((data, ctx) => {
  if (new Set(data.items.map(i => i.variantId)).size !== data.items.length)
    ctx.addIssue({ code: "custom", message: "Duplicate product lines are not allowed", path: ["items"] });
  if (data.method !== "pay_at_store" && !data.reference)
    ctx.addIssue({ code: "custom", message: "Enter the payment reference", path: ["reference"] });
});

export function saleTotal(lines: { price: number; qty: number }[]) {
  const total = lines.reduce((sum, line) => {
    if (!Number.isInteger(line.price) || line.price < 0 || !Number.isInteger(line.qty) || line.qty <= 0)
      throw new Error("Invalid sale line");
    return sum + line.price * line.qty;
  }, 0);
  if (!Number.isSafeInteger(total) || total > 2147483647) throw new Error("Sale total is too large");
  return total;
}
