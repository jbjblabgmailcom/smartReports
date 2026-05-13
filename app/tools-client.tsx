"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import JsonBuilderClient from "./json-builder-client";
import SmartRaportyClient from "./smart-raporty-client";
import type { Rules } from "@/lib/types";

type ToolId = "matcher" | "json-builder";

type ToolDefinition = {
  id: ToolId;
  name: string;
  description: string;
};

const tools: ToolDefinition[] = [
  {
    id: "matcher",
    name: "CMM Balloon Matcher",
    description: "Match balloon rows against CMM report files"
  },
  {
    id: "json-builder",
    name: "JSON Builder",
    description: "Build reports and reduced CSV files from JSON"
  }
];

export default function ToolsClient({ initialRules }: { initialRules: Rules }) {
  const router = useRouter();
  const [activeToolId, setActiveToolId] = useState<ToolId>("matcher");
  const activeTool = useMemo(() => tools.find((tool) => tool.id === activeToolId) || tools[0], [activeToolId]);

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Smart Raporty</p>
          <h1>{activeTool.name}</h1>
          <p className="tool-description">{activeTool.description}</p>
        </div>
        <button className="secondary-button" onClick={logout} type="button">
          Log out
        </button>
      </header>

      <nav aria-label="Tools" className="tool-menu">
        {tools.map((tool) => (
          <button
            className={tool.id === activeToolId ? "tool-tab active" : "tool-tab"}
            key={tool.id}
            onClick={() => setActiveToolId(tool.id)}
            type="button"
          >
            <span>{tool.name}</span>
            <small>{tool.description}</small>
          </button>
        ))}
      </nav>

      {activeToolId === "matcher" ? <SmartRaportyClient initialRules={initialRules} /> : null}
      {activeToolId === "json-builder" ? <JsonBuilderClient /> : null}
    </main>
  );
}
