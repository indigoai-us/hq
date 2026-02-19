import { readFileSync } from "node:fs";
import { join } from "node:path";

const TEMPLATES_DIR = "knowledge/public/pr/templates";

export function loadTemplate(templateName: string): string {
  const filePath = join(TEMPLATES_DIR, `${templateName}.md`);
  return readFileSync(filePath, "utf-8");
}

export function hydrateTemplate(template: string, variables: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
  }
  return result;
}

export function listTemplates(): string[] {
  const { readdirSync } = require("node:fs");
  try {
    const files: string[] = readdirSync(TEMPLATES_DIR);
    return files.filter((f: string) => f.endsWith(".md")).map((f: string) => f.replace(".md", ""));
  } catch {
    return [];
  }
}
