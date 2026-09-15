import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/db";
import * as schema from "@/db/schema";

export type AppRole =
  | "SUPER_ADMIN"
  | "ADMIN"
  | "INVENTORY_STAFF"
  | "ORDER_STAFF"
  | "CUSTOMER";

if (!process.env.BETTER_AUTH_SECRET) {
  throw new Error("BETTER_AUTH_SECRET is required (see .env.example)");
}

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false, // MVP: verification email is a later phase
    sendResetPassword: async ({ user, token }) => {
      const { queueEmail } = await import("./email");
      const { passwordResetEmail } = await import("@/emails");
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
      const { subject, html } = passwordResetEmail(`${appUrl}/reset-password?token=${token}`);
      // Queued, never throws for delivery failures: a mail outage must not
      // break the reset request itself.
      await queueEmail({ to: user.email, template: "password_reset", subject, html, userId: user.id });
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // refresh daily
    cookieCache: { enabled: true, maxAge: 60 * 5 },
  },
  rateLimit: { enabled: true },
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.users,
      session: schema.sessions,
      account: schema.accounts,
      verification: schema.verifications,
    },
  }),
  // Roles live in roles + user_roles (see lib/rbac.ts), not on the user row.
  databaseHooks: {
    user: {
      create: {
        // Welcome email after the account row exists. Fire-and-forget via
        // queueEmail: sign-up never waits on or fails from Resend.
        after: async (user) => {
          try {
            const { queueEmail } = await import("./email");
            const { welcomeEmail } = await import("@/emails");
            const { subject, html } = welcomeEmail(user.name ?? "there");
            await queueEmail({ to: user.email, template: "welcome", subject, html, userId: user.id });
          } catch (err) {
            console.error("[email:welcome] failed to queue", (err as Error)?.message ?? err);
          }
        },
      },
    },
  },
});
