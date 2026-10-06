import { NextResponse } from "next/server";
//import { getProjectById } from "@/lib/supabase/projects";
import { ExecuteUpdatePlan } from "@/lib/pipeline"; // パスは適宜調整してください

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: projectId } = await params;
    const body = await request.json();
    const { userPrompt } = body;

    if (!userPrompt) {
      return NextResponse.json(
        { error: "userPrompt is required" },
        { status: 400 },
      );
    }

    // パイプラインを実行
    await ExecuteUpdatePlan(projectId, userPrompt);

    return NextResponse.json({
      success: true,
      message: "Update plan executed successfully",
    });
  } catch (error) {
    console.error("ExecuteUpdatePlan Error:", error);
    return NextResponse.json(
      {
        error: "Failed to execute update plan",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
