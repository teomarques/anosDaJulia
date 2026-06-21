// POST /api/verify-token?token=xyz
//
// Validates a one-time-use token and BURNS it immediately on first success.
//
// Atomicity: we use a conditional `updateMany` with `where: { token, used: false }`.
// SQLite executes a single UPDATE atomically, so even if two requests arrive at
// the same instant, exactly one will report count=1 (granted) and the other
// count=0 (denied). This closes the refresh/share race window.
//
// Responses:
//   200 { ok: true }            -> token was valid and is now burned
//   403 { ok: false, reason }   -> token already used OR not provided
//   404 { ok: false, reason }   -> token does not exist

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");

  if (!token || token.length < 8) {
    return NextResponse.json(
      { ok: false, reason: "missing-token" },
      { status: 403 },
    );
  }

  try {
    // Atomic burn: only succeeds if the token exists and is still unused.
    const burned = await db.disposableToken.updateMany({
      where: { token, used: false },
      data: { used: true, usedAt: new Date() },
    });

    if (burned.count === 1) {
      // Granted — and the token is now permanently consumed.
      return NextResponse.json({ ok: true });
    }

    // count === 0: either it doesn't exist, or it was already used.
    const existing = await db.disposableToken.findUnique({
      where: { token },
      select: { used: true, usedAt: true },
    });

    if (!existing) {
      return NextResponse.json(
        { ok: false, reason: "invalid-token" },
        { status: 404 },
      );
    }

    // Already consumed — deny hard.
    return NextResponse.json(
      {
        ok: false,
        reason: "already-used",
        usedAt: existing.usedAt,
      },
      { status: 403 },
    );
  } catch (err) {
    console.error("verify-token error:", err);
    return NextResponse.json(
      { ok: false, reason: "server-error" },
      { status: 500 },
    );
  }
}

// GET behaves the same (handy for direct browser testing), but POST is the
// canonical, side-effect-safe verb used by the frontend.
export async function GET(req: NextRequest) {
  return POST(req);
}
