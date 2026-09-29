import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { generateUnityProject } from "@/lib/inngest/functions";

export const maxDuration = 60; // Vercel Hobbyの上限。各stepがこの時間内に収まればよい

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [generateUnityProject],
});
