import { readFile } from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function contentType(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    case ".mp3":
      return "audio/mpeg";
    case ".wav":
      return "audio/wav";
    case ".ogg":
      return "audio/ogg";
    default:
      return "application/octet-stream";
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path: pathSegments } = await params;
  const safeSegments = pathSegments.filter((segment) => segment && segment !== ".." && segment !== ".");
  const filePath = path.resolve(process.cwd(), "assets", ...safeSegments);
  const assetsRoot = path.resolve(process.cwd(), "assets");

  if (!filePath.startsWith(assetsRoot)) {
    return NextResponse.json({ ok: false, reason: "invalid-path" }, { status: 400 });
  }

  try {
    const file = await readFile(filePath);
    return new NextResponse(file, {
      headers: {
        "content-type": contentType(filePath),
        "cache-control": "public, max-age=60",
      },
    });
  } catch {
    return NextResponse.json({ ok: false, reason: "not-found" }, { status: 404 });
  }
}