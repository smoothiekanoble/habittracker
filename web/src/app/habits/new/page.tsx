import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { HabitForm } from "@/components/HabitForm";

export default async function NewHabitPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return <HabitForm mode="create" />;
}
