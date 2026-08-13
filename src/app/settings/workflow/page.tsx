import { redirect } from "next/navigation";

/**
 * The workflow moved out of Settings and into the AI agent section (its own
 * top-level rail item). This redirect keeps any bookmark or in-product link
 * from landing on a 404.
 */
export default function MovedWorkflowPage() {
  redirect("/ai/workflow");
}
