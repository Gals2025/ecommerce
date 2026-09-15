import { NextResponse } from "next/server";
import { getSession } from "@/lib/rbac";

export async function GET() {
  const session = await getSession().catch(() => null);
  if (!session) return NextResponse.json({ user: null }, { status: 401 });
  return NextResponse.json(session);
}
