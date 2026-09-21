import { NextResponse } from "next/server";
import { getSession, getStrictAdminSession } from "@/lib/rbac";

export async function GET(req: Request) {
  const strict = new URL(req.url).searchParams.get("strict") === "1";
  const session = await (strict ? getStrictAdminSession() : getSession()).catch(() => null);
  if (!session) return NextResponse.json({ user: null }, { status: 401 });
  return NextResponse.json(session);
}
