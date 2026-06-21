import { readdir } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const dirPath = path.resolve(process.cwd(), "assets", "pictures");
    const files = await readdir(dirPath);
    
    // Filter only valid image extensions
    const images = files
      .filter((file) => {
        const ext = path.extname(file).toLowerCase();
        return ext === ".jpg" || ext === ".jpeg" || ext === ".png" || ext === ".webp";
      })
      .map((file) => `/assets/pictures/${file}`);

    // Return the list of images
    return NextResponse.json({ ok: true, images });
  } catch (err) {
    console.error("Failed to read pictures directory:", err);
    return NextResponse.json(
      { ok: false, reason: "failed-to-read-dir" },
      { status: 500 },
    );
  }
}
