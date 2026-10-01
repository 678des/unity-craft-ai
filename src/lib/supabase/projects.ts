import { getAdminClient } from "./admin"; // または client.ts からのクライアント

export async function getProjectById(projectId: string) {
  const { data, error } = await getAdminClient()
    .from("projects") // あなたのSupabaseのテーブル名に合わせてください
    .select("*")
    .eq("id", projectId)
    .single();

  if (error) {
    console.error("Error fetching project:", error);
    return null;
  }

  return data;
}
