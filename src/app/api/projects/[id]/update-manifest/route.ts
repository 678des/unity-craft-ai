import { updateManifest } from "@/lib/github/manifest";
import { NextResponse } from "next/server";
export async function POST(request: Request) {
  try {
    await updateManifest(request);
    return NextResponse.json({ message: "Manifest updated successfully" });
  } catch (error) {
    console.error("Error updating manifest:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "サーバーエラーが発生しました",
      },
      { status: 500 },
    );
  }
}
