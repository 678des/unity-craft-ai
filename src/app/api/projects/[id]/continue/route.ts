import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { getProjectById } from "@/lib/supabase/projects";

import { ExecuteUpdatePlan } from "../../../../../lib/pipeline";
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: projectId } = await params;
    const { userPrompt } = await request.json(); // ユーザーからの追加・修正の要望

    const project = await getProjectById(projectId); // 既存のプロジェクト取得関数
    if (!project || !project.github_repo_name) {
      return NextResponse.json(
        { error: "プロジェクトまたはGitHubリポジトリが見つかりません" },
        { status: 404 },
      );
    }
    await ExecuteUpdatePlan(projectId, userPrompt);
  } catch {}
}
