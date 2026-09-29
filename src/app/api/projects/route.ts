import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { inngest } from "@/lib/inngest/client";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";

  if (prompt.length < 5) {
    return NextResponse.json(
      { error: "ゲームの内容を5文字以上で入力してください。" },
      { status: 400 }
    );
  }
  if (prompt.length > 2000) {
    return NextResponse.json(
      { error: "入力は2000文字以内にしてください。" },
      { status: 400 }
    );
  }

  const admin = getAdminClient();
  const { data, error } = await admin
    .from("projects")
    .insert({ prompt, status: "pending" })
    .select("id")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "プロジェクトを保存できませんでした。" },
      { status: 500 }
    );
  }

  try {
    await inngest.send({ name: "project/create", data: { projectId: data.id } });
  } catch (e) {
    await admin
      .from("projects")
      .update({ status: "failed", error_message: "ジョブの起動に失敗しました。" })
      .eq("id", data.id);
    return NextResponse.json({ error: "ジョブを起動できませんでした。" }, { status: 502 });
  }

  return NextResponse.json({ id: data.id }, { status: 201 });
}
