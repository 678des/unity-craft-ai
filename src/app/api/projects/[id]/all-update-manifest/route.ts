// import { NextResponse } from "next/server";
// import { Octokit } from "@octokit/rest";
// import { bootstrapManifest } from "@/lib/generateManifest";
// import { getProjectById } from "@/lib/supabase/projects"; // 既存の関数

// export async function POST(
//   _req: Request,
//   { params }: { params: Promise<{ id: string }> },
// ) {
//   const { id } = await params;
//   const project = await getProjectById(id);
//   if (!project?.github_repo_name) {
//     return NextResponse.json(
//       { error: "プロジェクトが見つかりません" },
//       { status: 404 },
//     );
//   }

//   const octokit = new Octokit({
//     auth: process.env.GITHUB_PERSONAL_ACCESS_TOKEN,
//   });
//   const { data: me } = await octokit.rest.users.getAuthenticated();
//   const { data: repo } = await octokit.rest.repos.get({
//     owner: me.login,
//     repo: project.github_repo_name,
//   });

//   const ctx = {
//     octokit,
//     owner: me.login,
//     repo: project.github_repo_name,
//     branch: repo.default_branch || "main",
//   };

//   const { manifest, warnings } = await bootstrapManifest(ctx);
//   return NextResponse.json({ manifest, warnings });
// }
