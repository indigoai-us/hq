/**
 * MarkdownRenderer - Lightweight markdown renderer using only React Native primitives.
 *
 * Renders common markdown elements:
 * - Headings (h1-h6) with scaled typography
 * - Bold and italic inline formatting
 * - Inline code with monospace styling
 * - Code blocks with dark background
 * - Bulleted and numbered lists
 * - Links (rendered as styled text)
 * - Horizontal rules
 * - Block quotes
 * - Paragraphs with proper spacing
 *
 * This is a simple parser - not a full CommonMark implementation.
 * It handles the most common patterns found in HQ knowledge files.
 */
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors, spacing, typography, borderRadius } from "../theme";

interface MarkdownRendererProps {
  /** Raw markdown string to render */
  content: string;
  /** Test ID prefix for testing */
  testID?: string;
}

/** A parsed markdown block */
type MarkdownBlock =
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph"; text: string }
  | { type: "code_block"; language: string; code: string }
  | { type: "list_item"; ordered: boolean; index: number; text: string }
  | { type: "blockquote"; text: string }
  | { type: "hr" }
  | { type: "empty" };

/** Parse markdown string into blocks */
function parseMarkdown(content: string): MarkdownBlock[] {
  const lines = content.split("\n");
  const blocks: MarkdownBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Empty line
    if (line.trim() === "") {
      blocks.push({ type: "empty" });
      i++;
      continue;
    }

    // Code block (fenced)
    if (line.trim().startsWith("```")) {
      const language = line.trim().slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      blocks.push({ type: "code_block", language, code: codeLines.join("\n") });
      continue;
    }

    // Horizontal rule
    if (/^(\s*[-*_]\s*){3,}$/.test(line)) {
      blocks.push({ type: "hr" });
      i++;
      continue;
    }

    // Heading
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      blocks.push({
        type: "heading",
        level: headingMatch[1].length,
        text: headingMatch[2],
      });
      i++;
      continue;
    }

    // Blockquote
    if (line.startsWith("> ")) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].startsWith("> ")) {
        quoteLines.push(lines[i].slice(2));
        i++;
      }
      blocks.push({ type: "blockquote", text: quoteLines.join("\n") });
      continue;
    }

    // Unordered list item
    const ulMatch = line.match(/^(\s*)[-*+]\s+(.+)/);
    if (ulMatch) {
      blocks.push({ type: "list_item", ordered: false, index: 0, text: ulMatch[2] });
      i++;
      continue;
    }

    // Ordered list item
    const olMatch = line.match(/^(\s*)(\d+)\.\s+(.+)/);
    if (olMatch) {
      blocks.push({
        type: "list_item",
        ordered: true,
        index: parseInt(olMatch[2], 10),
        text: olMatch[3],
      });
      i++;
      continue;
    }

    // Paragraph - collect consecutive non-empty lines
    const paraLines: string[] = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !lines[i].trim().startsWith("```") &&
      !lines[i].match(/^#{1,6}\s+/) &&
      !lines[i].startsWith("> ") &&
      !lines[i].match(/^[-*+]\s+/) &&
      !lines[i].match(/^\d+\.\s+/) &&
      !/^(\s*[-*_]\s*){3,}$/.test(lines[i])
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    blocks.push({ type: "paragraph", text: paraLines.join(" ") });
  }

  return blocks;
}

/** Render inline markdown formatting (bold, italic, code, links) */
function renderInlineText(text: string, key: string): React.JSX.Element {
  const parts: React.JSX.Element[] = [];
  // Match: **bold**, *italic*, `code`, [link](url)
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`|\[(.+?)\]\((.+?)\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let partIndex = 0;

  while ((match = regex.exec(text)) !== null) {
    // Text before the match
    if (match.index > lastIndex) {
      parts.push(
        <Text key={`${key}-${partIndex++}`} style={inlineStyles.text}>
          {text.slice(lastIndex, match.index)}
        </Text>,
      );
    }

    if (match[2]) {
      // Bold
      parts.push(
        <Text key={`${key}-${partIndex++}`} style={inlineStyles.bold}>
          {match[2]}
        </Text>,
      );
    } else if (match[3]) {
      // Italic
      parts.push(
        <Text key={`${key}-${partIndex++}`} style={inlineStyles.italic}>
          {match[3]}
        </Text>,
      );
    } else if (match[4]) {
      // Inline code
      parts.push(
        <Text key={`${key}-${partIndex++}`} style={inlineStyles.inlineCode}>
          {match[4]}
        </Text>,
      );
    } else if (match[5] && match[6]) {
      // Link - rendered as styled text (no external navigation in viewer)
      parts.push(
        <Text key={`${key}-${partIndex++}`} style={inlineStyles.link}>
          {match[5]}
        </Text>,
      );
    }

    lastIndex = match.index + match[0].length;
  }

  // Remaining text
  if (lastIndex < text.length) {
    parts.push(
      <Text key={`${key}-${partIndex++}`} style={inlineStyles.text}>
        {text.slice(lastIndex)}
      </Text>,
    );
  }

  if (parts.length === 0) {
    return (
      <Text key={key} style={inlineStyles.text}>
        {text}
      </Text>
    );
  }

  return (
    <Text key={key} style={inlineStyles.text}>
      {parts}
    </Text>
  );
}

/** Heading font sizes by level */
const headingSizes: Record<number, number> = {
  1: 26,
  2: 22,
  3: 19,
  4: 17,
  5: 15,
  6: 14,
};

export function MarkdownRenderer({
  content,
  testID,
}: MarkdownRendererProps): React.JSX.Element {
  const blocks = parseMarkdown(content);

  return (
    <View testID={testID} style={styles.container}>
      {blocks.map((block, index) => {
        const key = `block-${index}`;

        switch (block.type) {
          case "heading":
            return (
              <Text
                key={key}
                style={[
                  styles.heading,
                  { fontSize: headingSizes[block.level] ?? 14 },
                  block.level <= 2 && styles.headingLarge,
                ]}
                testID={`${testID}-heading-${index}`}
              >
                {block.text}
              </Text>
            );

          case "paragraph":
            return (
              <View key={key} style={styles.paragraph}>
                {renderInlineText(block.text, `para-${index}`)}
              </View>
            );

          case "code_block":
            return (
              <View key={key} style={styles.codeBlock} testID={`${testID}-code-${index}`}>
                {block.language ? (
                  <Text style={styles.codeLanguage}>{block.language}</Text>
                ) : null}
                <Text style={styles.codeText} selectable>
                  {block.code}
                </Text>
              </View>
            );

          case "list_item":
            return (
              <View key={key} style={styles.listItem}>
                <Text style={styles.listBullet}>
                  {block.ordered ? `${block.index}.` : "\u2022"}
                </Text>
                <View style={styles.listContent}>
                  {renderInlineText(block.text, `list-${index}`)}
                </View>
              </View>
            );

          case "blockquote":
            return (
              <View key={key} style={styles.blockquote}>
                <Text style={styles.blockquoteText}>{block.text}</Text>
              </View>
            );

          case "hr":
            return <View key={key} style={styles.hr} />;

          case "empty":
            return <View key={key} style={styles.emptyLine} />;

          default:
            return null;
        }
      })}
    </View>
  );
}

const inlineStyles = StyleSheet.create({
  text: {
    ...typography.body,
    color: colors.text.primary,
    lineHeight: 24,
  },
  bold: {
    ...typography.body,
    fontWeight: "700",
    color: colors.text.primary,
  },
  italic: {
    ...typography.body,
    fontStyle: "italic",
    color: colors.text.primary,
  },
  inlineCode: {
    ...typography.mono,
    backgroundColor: colors.background.tertiary,
    paddingHorizontal: 4,
    borderRadius: 3,
    color: colors.accent.yellow,
  },
  link: {
    ...typography.body,
    color: colors.accent.blue,
    textDecorationLine: "underline",
  },
});

const styles = StyleSheet.create({
  container: {
    paddingVertical: spacing.sm,
  },
  heading: {
    fontWeight: "700",
    color: colors.text.primary,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  headingLarge: {
    marginTop: spacing.xl,
    marginBottom: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  paragraph: {
    marginBottom: spacing.md,
  },
  codeBlock: {
    backgroundColor: colors.background.tertiary,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  codeLanguage: {
    ...typography.label,
    color: colors.text.tertiary,
    marginBottom: spacing.sm,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  codeText: {
    ...typography.mono,
    color: colors.text.primary,
  },
  listItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: spacing.xs,
    paddingLeft: spacing.md,
  },
  listBullet: {
    ...typography.body,
    color: colors.text.secondary,
    width: 20,
    marginRight: spacing.xs,
  },
  listContent: {
    flex: 1,
  },
  blockquote: {
    borderLeftWidth: 3,
    borderLeftColor: colors.accent.yellow,
    paddingLeft: spacing.md,
    marginVertical: spacing.sm,
    marginLeft: spacing.xs,
  },
  blockquoteText: {
    ...typography.body,
    color: colors.text.secondary,
    fontStyle: "italic",
  },
  hr: {
    height: 1,
    backgroundColor: colors.border.subtle,
    marginVertical: spacing.lg,
  },
  emptyLine: {
    height: spacing.xs,
  },
});
