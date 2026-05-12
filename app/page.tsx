import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";
import { loadRules } from "@/lib/rules-store";
import SmartRaportyClient from "./smart-raporty-client";

export default async function Home() {
  if (!(await isAuthenticated())) {
    redirect("/login");
  }

  const rules = await loadRules();
  return <SmartRaportyClient initialRules={rules} />;
}
