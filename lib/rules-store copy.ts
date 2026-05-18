import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { DEFAULT_RULES } from "./matcher";
import type { Rules } from "./types";

const RULES_PATH = path.join(process.cwd(), "data", "rules.json");

export async function loadRules(): Promise<Rules> {
  try {
    const loaded = JSON.parse(await readFile(RULES_PATH, "utf8"));
    if (!loaded || typeof loaded !== "object" || Array.isArray(loaded)) {
      return { ...DEFAULT_RULES };
    }

    const parsed: Rules = {};
    Object.entries(loaded).forEach(([hint, targets]) => {
      const key = hint.trim().toUpperCase();
      if (typeof targets === "string") {
        parsed[key] = targets
          .split(",")
          .map((target) => target.trim())
          .filter(Boolean);
      } else if (Array.isArray(targets)) {
        parsed[key] = targets.map((target) => String(target).trim()).filter(Boolean);
      } else {
        parsed[key] = [];
      }
    });

    return { ...DEFAULT_RULES, ...parsed };
  } catch {
    return { ...DEFAULT_RULES };
  }
}

export async function saveRules(rules: Rules): Promise<Rules> {
  const normalized: Rules = {};
  Object.entries(rules).forEach(([hint, targets]) => {
    const key = hint.trim().toUpperCase();
    if (!key) {
      return;
    }
    normalized[key] = Array.isArray(targets)
      ? targets.map((target) => String(target).trim()).filter(Boolean)
      : [];
  });

  await mkdir(path.dirname(RULES_PATH), { recursive: true });
  await writeFile(RULES_PATH, JSON.stringify(normalized, null, 2), "utf8");
  return normalized;
}
