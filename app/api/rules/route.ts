import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { loadRules, saveRules } from "@/lib/rules-store";
import type { Rules } from "@/lib/types";

export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json(await loadRules());
}

export async function PUT(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const rules = (await request.json().catch(() => null)) as Rules | null;
  if (!rules || typeof rules !== "object" || Array.isArray(rules)) {
    return NextResponse.json({ message: "Invalid rules payload." }, { status: 400 });
  }

  return NextResponse.json(await saveRules(rules));
}
