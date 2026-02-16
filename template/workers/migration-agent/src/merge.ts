/**
 * CLAUDE.md merge utilities for HQ migration.
 *
 * Extracted from skills/execute.md Step 3 (section_merge strategy).
 * Handles lossless merging of template structure with user content.
 */

/**
 * Extract a markdown section by heading.
 * Returns the section content including the heading line.
 * Follows the algorithm from execute.md extract_section.
 */
export function extractSection(content: string, heading: string): string | null {
  const lines = content.split("\n");
  const sectionLines: string[] = [];
  let inSection = false;

  // Count the heading level (number of leading #)
  const headingLevel = heading.match(/^#+/)?.[0].length ?? 0;

  for (const line of lines) {
    if (!inSection) {
      // Check for exact heading match (heading text match, not just prefix)
      if (line.trimEnd() === heading || line.startsWith(heading + " ") || line === heading) {
        // More precise: the line should start with the heading
        if (line.trimEnd() === heading) {
          inSection = true;
          sectionLines.push(line);
          continue;
        }
      }
    } else {
      // Check if we hit the next heading at same or higher level
      const lineHeadingMatch = line.match(/^(#+)\s/);
      if (lineHeadingMatch) {
        const lineLevel = lineHeadingMatch[1].length;
        if (lineLevel <= headingLevel) {
          // Next section at same or higher level -- stop
          break;
        }
      }
      sectionLines.push(line);
    }
  }

  if (sectionLines.length === 0) {
    return null;
  }

  // Trim trailing blank lines but preserve internal ones
  while (
    sectionLines.length > 0 &&
    sectionLines[sectionLines.length - 1].trim() === ""
  ) {
    sectionLines.pop();
  }

  return sectionLines.join("\n");
}

/**
 * Merge CLAUDE.md: preserve user's Learned Rules while updating template sections.
 *
 * From execute.md section_merge strategy:
 * 1. Extract user's "## Learned Rules" section from local content
 * 2. Replace template's "## Learned Rules" section with user's
 * 3. Validate that all user rules appear verbatim in merged output
 */
export function mergeCLAUDEmd(
  templateContent: string,
  localContent: string
): MergeResult {
  // Extract user's Learned Rules
  const userRules = extractSection(localContent, "## Learned Rules");

  if (!userRules) {
    // No user rules -- use template as-is
    return {
      merged: templateContent,
      success: true,
      rulesPreserved: false,
      message: "No user Learned Rules found; template used as-is",
    };
  }

  // Check if template has a Learned Rules section
  const templateRules = extractSection(templateContent, "## Learned Rules");

  let merged: string;
  if (templateRules) {
    // Replace template's section with user's
    merged = templateContent.replace(templateRules, userRules);
  } else {
    // Append user's rules at the end
    merged = templateContent.trimEnd() + "\n\n" + userRules + "\n";
  }

  // Validate: every non-blank line from user rules must appear in merged output
  const userRuleLines = userRules
    .split("\n")
    .filter((line) => line.trim() !== "");
  const lostLines: string[] = [];

  for (const line of userRuleLines) {
    if (!merged.includes(line)) {
      lostLines.push(line);
    }
  }

  if (lostLines.length > 0) {
    return {
      merged: localContent, // Fall back to keeping user version
      success: false,
      rulesPreserved: true,
      message: `Merge failed: ${lostLines.length} line(s) would be lost. Keeping user version.`,
      lostLines,
    };
  }

  return {
    merged,
    success: true,
    rulesPreserved: true,
    message: "Learned Rules preserved verbatim",
  };
}

export interface MergeResult {
  merged: string;
  success: boolean;
  rulesPreserved: boolean;
  message: string;
  lostLines?: string[];
}

/**
 * Extract a YAML block by key name (root-level key).
 * From execute.md extract_yaml_block helper.
 */
export function extractYamlBlock(content: string, key: string): string | null {
  const lines = content.split("\n");
  const blockLines: string[] = [];
  let inBlock = false;
  let blockIndent = -1;
  const keyPattern = new RegExp(`^${key}:`);

  for (const line of lines) {
    if (!inBlock) {
      if (keyPattern.test(line)) {
        inBlock = true;
        blockLines.push(line);

        // Check if block scalar (| or |+)
        if (/:\s*\|/.test(line) || /:\s*$/.test(line)) {
          blockIndent = -2; // Will detect from next line
        } else {
          // Inline value -- just this one line
          break;
        }
        continue;
      }
    } else {
      if (blockIndent === -2) {
        // First indented line determines indent level
        const match = line.match(/^(\s+)/);
        if (match) {
          blockIndent = match[1].length;
          blockLines.push(line);
        } else if (line.trim() === "") {
          blockLines.push(line);
        } else {
          // Non-indented, non-blank: next root key
          break;
        }
      } else {
        // Check if line continues the block
        const leadingSpaces = line.match(/^(\s*)/)?.[1].length ?? 0;
        if (leadingSpaces >= blockIndent || line.trim() === "") {
          blockLines.push(line);
        } else {
          break;
        }
      }
    }
  }

  if (blockLines.length === 0) return null;

  // Trim trailing blank lines
  while (
    blockLines.length > 0 &&
    blockLines[blockLines.length - 1].trim() === ""
  ) {
    blockLines.pop();
  }

  return blockLines.join("\n");
}

/**
 * Extract root-level YAML keys from content.
 */
export function extractRootYamlKeys(content: string): string[] {
  const keys: string[] = [];
  for (const line of content.split("\n")) {
    const match = line.match(/^([a-zA-Z_][a-zA-Z0-9_-]*):/);
    if (match) {
      keys.push(match[1]);
    }
  }
  return keys;
}

/**
 * Merge worker.yaml: preserve user's instructions block while updating template.
 */
export function mergeWorkerYaml(
  templateContent: string,
  localContent: string
): MergeResult {
  const userInstructions = extractYamlBlock(localContent, "instructions");

  if (!userInstructions) {
    return {
      merged: templateContent,
      success: true,
      rulesPreserved: false,
      message: "No user instructions found; template used as-is",
    };
  }

  const templateInstructions = extractYamlBlock(templateContent, "instructions");

  let merged: string;
  if (templateInstructions) {
    merged = templateContent.replace(templateInstructions, userInstructions);
  } else {
    merged = templateContent.trimEnd() + "\n\n" + userInstructions + "\n";
  }

  // Also preserve custom keys
  const templateKeys = extractRootYamlKeys(templateContent);
  const localKeys = extractRootYamlKeys(localContent);
  const customKeys = localKeys.filter((k) => !templateKeys.includes(k));

  for (const key of customKeys) {
    const block = extractYamlBlock(localContent, key);
    if (block && !merged.includes(block)) {
      merged = merged.trimEnd() + "\n\n" + block + "\n";
    }
  }

  return {
    merged,
    success: true,
    rulesPreserved: true,
    message: "User instructions preserved",
  };
}

/**
 * Detect markdown section changes between two versions.
 * Returns lists of added and removed section headings.
 */
export function detectMarkdownSectionChanges(
  templateLines: string[],
  localLines: string[]
): { added: string[]; removed: string[] } {
  const templateHeadings = templateLines.filter((l) => l.startsWith("#"));
  const localHeadings = localLines.filter((l) => l.startsWith("#"));

  const added = templateHeadings.filter((h) => !localHeadings.includes(h));
  const removed = localHeadings.filter((h) => !templateHeadings.includes(h));

  return { added, removed };
}
