// One-off: grant SUPER_ADMIN to a user by email. Idempotent.
// Usage: DATABASE_URL=... npx tsx scripts/make-admin.ts user@example.com
//   or:  DATABASE_URL=... ADMIN_EMAIL=user@example.com npm run db:make-admin
import { eq } from "drizzle-orm";
import { db } from "../db";
import { roles, userRoles, users } from "../db/schema";

function resolveEmail(emailArg?: string): string {
  const raw = (emailArg ?? process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  if (!raw) {
    throw new Error(
      "Missing email. Pass it as an argument (npx tsx scripts/make-admin.ts user@example.com) or set ADMIN_EMAIL."
    );
  }
  return raw;
}

export async function makeAdmin(emailArg?: string) {
  const email = resolveEmail(emailArg);

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set. Refusing to run without an explicit target DB.");
  }

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) {
    throw new Error(
      `No users row for ${email}. Ask them to sign up first (POST /api/auth/signup), then re-run.`
    );
  }

  // Ensure canonical roles exist (same names as db/seed.ts).
  for (const name of ["SUPER_ADMIN", "ADMIN", "INVENTORY_STAFF", "ORDER_STAFF", "CUSTOMER"]) {
    await db.insert(roles).values({ name, description: `${name} role` }).onConflictDoNothing();
  }
  const allRoles = await db.select().from(roles);
  const superAdmin = allRoles.find((r) => r.name === "SUPER_ADMIN")!;

  await db
    .insert(userRoles)
    .values({ userId: user.id, roleId: superAdmin.id, grantedBy: user.id })
    .onConflictDoNothing();

  const check = await db.select().from(userRoles).where(eq(userRoles.userId, user.id));
  const held = check
    .map((ur) => allRoles.find((r) => r.id === ur.roleId)?.name)
    .filter(Boolean);
  console.log(`OK: ${email} (id=${user.id}) now holds: ${held.join(", ")}`);
}

const isDirectRun =
  !!process.argv[1] &&
  (process.argv[1].endsWith("scripts/make-admin.ts") ||
    process.argv[1].endsWith("make-admin"));

if (isDirectRun) {
  const emailArg = process.argv[2] && !process.argv[2].startsWith("-") ? process.argv[2] : undefined;
  makeAdmin(emailArg).then(
    () => process.exit(0),
    (err) => {
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    }
  );
}
