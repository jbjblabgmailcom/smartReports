import { NextResponse } from "next/server";
import { createSessionToken, sessionCookie } from "@/lib/auth";

export async function POST(request: Request) {
  const { username, password } = (await request.json().catch(() => ({}))) as {
    username?: string;
    password?: string;
  };

  const expectedUsername = process.env.APP_USERNAME || "admin";
  const expectedPassword = process.env.APP_PASSWORD || "admin";

  if (username !== expectedUsername || password !== expectedPassword) {
    return NextResponse.json({ message: "Invalid username or password." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(sessionCookie(createSessionToken(expectedUsername)));
  return response;
}
