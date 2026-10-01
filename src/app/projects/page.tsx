import { supabase } from "@/lib/supabase/client";
import type { AgentLog, Project } from "@/lib/types";

export default async function ProjectsHome() {
  //const [logs, setLogs] = useState<AgentLog[]>([]);
  // TODO: id,project名,status,created_at等を取得する
  const { data: projects } = await supabase.from("projects").select("*");

  return (
    <div>
      {projects?.map((project) => (
        <div key={project.id}>
          <a href={`/projects/${project.id}`}>{project.github_repo_name}</a>
        </div>
      ))}
    </div>
  );
}
