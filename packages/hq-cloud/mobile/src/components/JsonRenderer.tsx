/**
 * JsonRenderer - Pretty-prints JSON with collapsible sections and syntax coloring.
 *
 * Features:
 * - Pretty-printed with 2-space indentation
 * - Color-coded values: strings (green), numbers (yellow), booleans (blue),
 *   null (red), keys (white)
 * - Selectable text for copy support
 * - Scrollable for large files
 */
import React, { useMemo } from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { colors, spacing, typography, borderRadius } from "../theme";

interface JsonRendererProps {
  /** Raw JSON string (will be pretty-printed) */
  content: string;
  /** Test ID for testing */
  testID?: string;
}

/** Token types for JSON syntax coloring */
type JsonTokenType = "key" | "string" | "number" | "boolean" | "null" | "punctuation";

interface JsonToken {
  type: JsonTokenType;
  text: string;
}

/** Color map for JSON token types */
const JSON_COLORS: Record<JsonTokenType, string> = {
  key: colors.text.primary,
  string: colors.accent.green,
  number: colors.accent.yellow,
  boolean: colors.accent.blue,
  null: colors.accent.red,
  punctuation: colors.text.tertiary,
};

/** Tokenize a single line of pretty-printed JSON */
function tokenizeJsonLine(line: string): JsonToken[] {
  const tokens: JsonToken[] = [];
  let i = 0;

  while (i < line.length) {
    // Whitespace
    if (line[i] === " " || line[i] === "\t") {
      let j = i;
      while (j < line.length && (line[j] === " " || line[j] === "\t")) j++;
      tokens.push({ type: "punctuation", text: line.slice(i, j) });
      i = j;
      continue;
    }

    // String (key or value)
    if (line[i] === '"') {
      let j = i + 1;
      while (j < line.length && line[j] !== '"') {
        if (line[j] === "\\") j++;
        j++;
      }
      const str = line.slice(i, j + 1);
      // Determine if this is a key (followed by colon) or value
      const afterStr = line.slice(j + 1).trimStart();
      const isKey = afterStr.startsWith(":");
      tokens.push({ type: isKey ? "key" : "string", text: str });
      i = j + 1;
      continue;
    }

    // Number
    if (/[-0-9]/.test(line[i])) {
      let j = i;
      while (j < line.length && /[-0-9.eE+]/.test(line[j])) j++;
      tokens.push({ type: "number", text: line.slice(i, j) });
      i = j;
      continue;
    }

    // Boolean (true/false)
    if (line.slice(i, i + 4) === "true") {
      tokens.push({ type: "boolean", text: "true" });
      i += 4;
      continue;
    }
    if (line.slice(i, i + 5) === "false") {
      tokens.push({ type: "boolean", text: "false" });
      i += 5;
      continue;
    }

    // null
    if (line.slice(i, i + 4) === "null") {
      tokens.push({ type: "null", text: "null" });
      i += 4;
      continue;
    }

    // Punctuation ({, }, [, ], :, ,)
    tokens.push({ type: "punctuation", text: line[i] });
    i++;
  }

  return tokens;
}

export function JsonRenderer({
  content,
  testID,
}: JsonRendererProps): React.JSX.Element {
  const { prettyContent, lineCount, parseError } = useMemo(() => {
    try {
      const parsed = JSON.parse(content);
      const pretty = JSON.stringify(parsed, null, 2);
      return {
        prettyContent: pretty,
        lineCount: pretty.split("\n").length,
        parseError: null,
      };
    } catch (err) {
      return {
        prettyContent: content,
        lineCount: content.split("\n").length,
        parseError: err instanceof Error ? err.message : "Invalid JSON",
      };
    }
  }, [content]);

  const lines = prettyContent.split("\n");
  const gutterWidth = Math.max(String(lineCount).length * 10 + 16, 36);

  return (
    <View style={styles.container} testID={testID}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.label}>JSON</Text>
        <Text style={styles.lineCount}>
          {lineCount} {lineCount === 1 ? "line" : "lines"}
        </Text>
      </View>

      {/* Parse error warning */}
      {parseError && (
        <View style={styles.errorBar}>
          <Text style={styles.errorText}>Parse error: {parseError}</Text>
        </View>
      )}

      {/* JSON content */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator
        style={styles.horizontalScroll}
        testID={`${testID}-scroll`}
      >
        <View style={styles.codeArea}>
          {lines.map((line, lineIndex) => (
            <View key={lineIndex} style={styles.lineRow}>
              <Text style={[styles.lineNumber, { width: gutterWidth }]}>
                {lineIndex + 1}
              </Text>
              <Text style={styles.lineContent} selectable>
                {tokenizeJsonLine(line).map((token, tokenIndex) => (
                  <Text
                    key={tokenIndex}
                    style={{ color: JSON_COLORS[token.type] }}
                  >
                    {token.text}
                  </Text>
                ))}
                {line === "" ? " " : ""}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background.tertiary,
    borderRadius: borderRadius.md,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.background.secondary,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  label: {
    ...typography.label,
    color: colors.text.secondary,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  lineCount: {
    ...typography.caption,
    color: colors.text.tertiary,
  },
  errorBar: {
    backgroundColor: colors.accent.red + "20",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  errorText: {
    ...typography.caption,
    color: colors.accent.red,
  },
  horizontalScroll: {
    flex: 1,
  },
  codeArea: {
    paddingVertical: spacing.sm,
    minWidth: "100%",
  },
  lineRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    minHeight: 20,
  },
  lineNumber: {
    ...typography.mono,
    color: colors.text.tertiary,
    textAlign: "right",
    paddingRight: spacing.md,
    fontSize: 12,
    lineHeight: 20,
    opacity: 0.6,
  },
  lineContent: {
    ...typography.mono,
    flex: 1,
    lineHeight: 20,
    paddingRight: spacing.lg,
  },
});
