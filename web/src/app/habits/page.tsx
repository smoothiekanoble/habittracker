import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { HabitsListPage } from "@/components/HabitsListPage";

export default async function HabitsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return <HabitsListPage />;
}
