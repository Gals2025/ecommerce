import { Resend } from "resend";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { emailLogs, type EmailTemplate } from "@/db/schema";

const resend = new Resend(process.env.RESEND_API_KEY ?? "re_test");

export type { EmailTemplate };

export async function sendEmail(to: string, subject: string, html: string) {
  if (!process.env.RESEND_API_KEY) {
    console.log(`[email:skipped] to=${to} subject=${subject}`);
    return;
  }
  await resend.emails.send({
    from: process.env.EMAIL_FROM ?? "orders@example.ph",
    to,
    subject,
    html,
  });
}

export type QueueEmailInput = {
  to: string;
  template: EmailTemplate;
  subject: string;
  html: string;
  orderId?: string | null;
  userId?: string | null;
};

/**
 * Fire-and-forget transactional send. Records an email_logs row (queued),
 * then sends WITHOUT blocking the caller: the returned promise resolves to
 * the log id once queued, and the Resend outcome flips the row to sent
 * (+ Resend ID), failed, or skipped — never throwing for delivery failures.
 * Call only AFTER the business transaction commits, never inside it.
 */
export async function queueEmail(input: QueueEmailInput): Promise<string> {
  if (!input.to || !input.subject || !input.html) {
    throw new Error("queueEmail requires to, subject, and html");
  }
  const [row] = await db
    .insert(emailLogs)
    .values({
      toEmail: input.to,
      template: input.template,
      subject: input.subject,
      orderId: input.orderId ?? null,
      userId: input.userId ?? null,
      status: "queued",
    })
    .returning();

  if (!process.env.RESEND_API_KEY) {
    console.log(`[email:skipped] to=${input.to} subject=${input.subject}`);
    await db.update(emailLogs).set({ status: "skipped", updatedAt: new Date() }).where(eq(emailLogs.id, row.id));
    return row.id;
  }

  void resend.emails
    .send({
      from: process.env.EMAIL_FROM ?? "orders@example.ph",
      to: input.to,
      subject: input.subject,
      html: input.html,
    })
    .then(async (res) => {
      if (res.error) {
        await db
          .update(emailLogs)
          .set({ status: "failed", error: String(res.error.message ?? res.error).slice(0, 1000), updatedAt: new Date() })
          .where(eq(emailLogs.id, row.id));
      } else {
        await db
          .update(emailLogs)
          .set({ status: "sent", resendId: res.data?.id ?? null, updatedAt: new Date() })
          .where(eq(emailLogs.id, row.id));
      }
    })
    .catch(async (err: unknown) => {
      await db
        .update(emailLogs)
        .set({ status: "failed", error: String((err as Error)?.message ?? err).slice(0, 1000), updatedAt: new Date() })
        .where(eq(emailLogs.id, row.id));
    });
  return row.id;
}

