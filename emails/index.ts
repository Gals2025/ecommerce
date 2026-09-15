import { formatPHP } from "@/lib/money";

const wrap = (title: string, body: string) =>
  `<div style="font-family:sans-serif;max-width:560px"><h2>${title}</h2>${body}<p style="color:#666;font-size:12px">Asia/Manila • amounts in Philippine Peso (₱)</p></div>`;

/** HTML-escape for user/admin-controlled values interpolated into templates. */
export function esc(value: string | null | undefined): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export const welcomeEmail = (name: string) => ({
  subject: `Welcome to the store, ${esc(name)}!`,
  html: wrap(
    `Welcome, ${esc(name)}!`,
    `<p>Your account is ready. Browse the shop, earn membership perks on every purchase, and check out with cash on delivery, bank transfer, GCash, or in-store payment.</p>`
  ),
});

export const paymentReceivedEmail = (orderNo: string) => ({
  subject: `Payment received for ${orderNo} — verifying`,
  html: wrap(
    `Payment received`,
    `<p>We received your payment proof for order <b>${orderNo}</b>. Our team is verifying it now — you will get a confirmation once approved.</p>`
  ),
});

export const orderProcessingEmail = (orderNo: string) => ({
  subject: `Order ${orderNo} is being prepared`,
  html: wrap(`Order processing`, `<p>Order <b>${orderNo}</b> is confirmed and now <b>being prepared</b> by our team.</p>`),
});

export const readyForPickupEmail = (orderNo: string) => ({
  subject: `Order ${orderNo} ready for pickup`,
  html: wrap(`Ready for pickup`, `<p>Order <b>${orderNo}</b> is <b>ready for pickup</b> at the store. Please bring a valid ID.</p>`),
});

export const shippedEmail = (orderNo: string) => ({
  subject: `Order ${orderNo} shipped`,
  html: wrap(`Order shipped`, `<p>Order <b>${orderNo}</b> is <b>on its way</b>. Delivery fees confirmed by staff apply on arrival where applicable.</p>`),
});

export const completedEmail = (orderNo: string) => ({
  subject: `Order ${orderNo} completed — thank you!`,
  html: wrap(`Order completed`, `<p>Order <b>${orderNo}</b> is <b>completed</b>. Thank you for shopping with us — your purchases count toward membership perks.</p>`),
});

export const cancelledEmail = (orderNo: string, reason?: string) => ({
  subject: `Order ${esc(orderNo)} cancelled`,
  html: wrap(
    `Order cancelled`,
    `<p>Order <b>${esc(orderNo)}</b> has been <b>cancelled</b>${reason ? ` (${esc(reason)})` : ""}. Any reserved stock was released and applicable payments will be refunded.</p>`
  ),
});

export const membershipActivatedEmail = (tier: string, membershipNo: string, expiry: string | null) => ({
  subject: `Your ${esc(tier)} membership is active (${esc(membershipNo)})`,
  html: wrap(
    `Membership activated`,
    `<p>Your <b>${esc(tier)}</b> membership (<b>${esc(membershipNo)}</b>) is now <b>active</b>${expiry ? ` until <b>${esc(expiry)}</b>` : " with no expiry"}. Member prices and discounts apply automatically at checkout.</p>`
  ),
});

export const membershipExpiringEmail = (tier: string, membershipNo: string, expiry: string) => ({
  subject: `Your ${esc(tier)} membership expires soon (${esc(membershipNo)})`,
  html: wrap(
    `Membership expiring`,
    `<p>Your <b>${esc(tier)}</b> membership (<b>${esc(membershipNo)}</b>) expires on <b>${esc(expiry)}</b>. Renew in store to keep your member prices and discounts.</p>`
  ),
});

export const orderReceivedEmail = (orderNo: string, total: number) => ({
  subject: `Order ${orderNo} received`,
  html: wrap(
    `Thank you! Order ${orderNo} received`,
    `<p>Your order is <b>pending</b>. Total: <b>${formatPHP(total)}</b>.</p><p>For GCash/Maya, reply with your payment receipt to confirm.</p>`
  ),
});

export const paymentVerifiedEmail = (orderNo: string) => ({
  subject: `Payment verified for ${orderNo}`,
  html: wrap(`Payment verified`, `<p>Order <b>${orderNo}</b> is now <b>paid</b> and being prepared.</p>`),
});

export const shipmentEmail = (orderNo: string, mode: string) => ({
  subject: `Order ${orderNo} ${mode === "pickup" ? "ready for pickup" : "shipped"}`,
  html: wrap(`Order update`, `<p>Order <b>${orderNo}</b> is <b>${mode === "pickup" ? "ready for pickup" : "on its way"}</b>.</p>`),
});

export const tierUpgradeEmail = (tier: string) => ({
  subject: `You've reached ${esc(tier)} membership!`,
  html: wrap(`Membership upgrade`, `<p>Congratulations! You are now a <b>${esc(tier)}</b> member. Your discount applies automatically at checkout.</p>`),
});

export const refundEmail = (orderNo: string, amount: number) => ({
  subject: `Refund processed for ${orderNo}`,
  html: wrap(`Refund processed`, `<p>A refund of <b>${formatPHP(amount)}</b> for order <b>${orderNo}</b> has been completed.</p>`),
});

export const passwordResetEmail = (resetUrl: string) => ({
  subject: `Reset your password`,
  html: wrap(
    `Reset your password`,
    `<p>We received a request to reset your password. Click the link below (valid for 1 hour):</p><p><a href="${resetUrl}">Reset password</a></p><p>If you did not request this, ignore this email.</p>`
  ),
});
