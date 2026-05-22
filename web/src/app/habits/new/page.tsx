import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { HabitForm } from "@/components/HabitForm";

export default async function NewHabitPage() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) redirect("/login");
  return <HabitForm mode="create" />;
}
