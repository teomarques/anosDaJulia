// POST /api/generate-token
//
// Creates a fresh one-time-use token and returns the shareable link.
// Protected by an admin secret so only the sender can mint links.
//
// Body:  { "secret": "<ADMIN_SECRET>", "label"?: "para a Julia" }
// Resp:  { "token": "abc...", "url": "https://site.com/?token=abc..." }
//
// The secret is read from process.env.ADMIN_SECRET. In development you can
// set it in .env; on Vercel set it in the project's environment variables.

import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

function generateToken(): string {
  // 24 bytes of randomness, URL-safe base64 => ~32 chars, >128 bits of entropy.
  return randomBytes(24).toString("base64url");
}

export async function POST(req: NextRequest) {
  const adminSecret = process.env.ADMIN_SECRET;

  // If no admin secret is configured, refuse to run (safety default).
  if (!adminSecret) {
    return NextResponse.json(
      { ok: false, reason: "ADMIN_SECRET not configured on the server" },
      { status: 500 },
    );
  }

  let body: { secret?: string; label?: string } = {};
  try {
    body = await req.json();
  } catch {
    // allow empty body
  }

  if (body.secret !== adminSecret) {
    return NextResponse.json(
      { ok: false, reason: "unauthorized" },
      { status: 401 },
    );
  }

  // Mint the token, guaranteeing uniqueness with a retry loop.
  let token = generateToken();
  for (let attempt = 0; attempt < 5; attempt++) {
    const existing = await db.disposableToken.findUnique({ where: { token } });
    if (!existing) break;
    token = generateToken();
  }

  await db.disposableToken.create({
    data: { token, label: body.label ?? null },
  });

  // Build the public URL. We infer the origin from the request headers so it
  // works both in the preview and in production.
  const origin = req.nextUrl.origin;
  const url = `${origin}/?token=${token}`;

  return NextResponse.json({ ok: true, token, url });
}

// A convenience GET so the sender can mint a token straight from the browser
// address bar during testing: /api/generate-token?secret=xxx&label=...
export async function GET(req: NextRequest) {
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) {
    return NextResponse.json(
      { ok: false, reason: "ADMIN_SECRET not configured on the server" },
      { status: 500 },
    );
  }
  const secret = req.nextUrl.searchParams.get("secret");
  const label = req.nextUrl.searchParams.get("label") ?? undefined;
  return POST(
    new NextRequest(req.nextUrl, {
      method: "POST",
      body: JSON.stringify({ secret, label }),
      headers: { "content-type": "application/json" },
    }),
  );
}
