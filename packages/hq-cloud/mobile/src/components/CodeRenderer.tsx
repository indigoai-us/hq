/**
 * CodeRenderer - Syntax-highlighted code viewer using React Native primitives.
 *
 * Provides:
 * - Line numbers in a gutter column
 * - Keyword highlighting for common programming patterns
 * - Selectable text for copy support
 * - Horizontal scroll for long lines
 * - Language label header
 *
 * Highlights:
 * - Keywords (function, const, return, etc.) in accent blue
 * - Strings in accent green
 * - Comments in muted gray
 * - Numbers in accent yellow
 * - Types/classes in accent purple
 */
import React, { useMemo } from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { colors, spacing, typography, borderRadius } from "../theme";

interface CodeRendererProps {
  /** Source code to render */
  content: string;
  /** Language label to display in the header */
  language: string;
  /** Whether to show line numbers (default: true) */
  showLineNumbers?: boolean;
  /** Test ID for testing */
  testID?: string;
}

/** Token types for syntax coloring */
type TokenType = "keyword" | "string" | "comment" | "number" | "type" | "plain";

interface Token {
  type: TokenType;
  text: string;
}

/** Common keywords across popular languages */
const KEYWORDS = new Set([
  // JS/TS
  "const", "let", "var", "function", "return", "if", "else", "for", "while",
  "do", "switch", "case", "break", "continue", "new", "this", "class",
  "extends", "import", "export", "from", "default", "async", "await",
  "try", "catch", "finally", "throw", "typeof", "instanceof", "in", "of",
  "null", "undefined", "true", "false", "void", "yield", "interface", "type",
  "enum", "implements", "abstract", "private", "protected", "public", "static",
  "readonly",
  // Python
  "def", "class", "import", "from", "return", "if", "elif", "else", "for",
  "while", "try", "except", "finally", "raise", "with", "as", "pass", "lambda",
  "yield", "global", "nonlocal", "True", "False", "None", "and", "or", "not",
  "is", "in", "del", "print", "self",
  // Go
  "func", "package", "import", "var", "const", "type", "struct", "interface",
  "map", "chan", "go", "defer", "select", "range", "make", "append",
]);

/** Type/class patterns: words starting with uppercase followed by lowercase */
const TYPE_PATTERN = /^[A-Z][a-zA-Z0-9]+$/;

/** Tokenize a single line of code for syntax highlighting */
function tokenizeLine(line: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < line.length) {
    // Single-line comment (// or #)
    if (
      (line[i] === "/" && line[i + 1] === "/") ||
      (line[i] === "#" && (i === 0 || line[i - 1] === " "))
    ) {
      tokens.push({ type: "comment", text: line.slice(i) });
      break;
    }

    // String (double or single quoted)
    if (line[i] === '"' || line[i] === "'" || line[i] === "`") {
      const quote = line[i];
      let j = i + 1;
      while (j < line.length && line[j] !== quote) {
        if (line[j] === "\\") j++; // skip escaped chars
        j++;
      }
      tokens.push({ type: "string", text: line.slice(i, j + 1) });
      i = j + 1;
      continue;
    }

    // Number
    if (/[0-9]/.test(line[i]) && (i === 0 || /[\s(,=:[\]{}<>+\-*/!&|^~%]/.test(line[i - 1]))) {
      let j = i;
      while (j < line.length && /[0-9.xXa-fA-F_]/.test(line[j])) j++;
      tokens.push({ type: "number", text: line.slice(i, j) });
      i = j;
      continue;
    }

    // Word (keyword, type, or identifier)
    if (/[a-zA-Z_$]/.test(line[i])) {
      let j = i;
      while (j < line.length && /[a-zA-Z0-9_$]/.test(line[j])) j++;
      const word = line.slice(i, j);
      if (KEYWORDS.has(word)) {
        tokens.push({ type: "keyword", text: word });
      } else if (TYPE_PATTERN.test(word)) {
        tokens.push({ type: "type", text: word });
      } else {
        tokens.push({ type: "plain", text: word });
      }
      i = j;
      continue;
    }

    // Other characters (operators, punctuation, whitespace)
    tokens.push({ type: "plain", text: line[i] });
    i++;
  }

  return tokens;
}

/** Color map for token types */
const TOKEN_COLORS: Record<TokenType, string> = {
  keyword: colors.accent.blue,
  string: colors.accent.green,
  comment: colors.text.tertiary,
  number: colors.accent.yellow,
  type: colors.accent.purple,
  plain: colors.text.primary,
};

export function CodeRenderer({
  content,
  language,
  showLineNumbers = true,
  testID,
}: CodeRendererProps): React.JSX.Element {
  const lines = useMemo(() => content.split("\n"), [content]);
  const lineCount = lines.length;
  const gutterWidth = Math.max(String(lineCount).length * 10 + 16, 36);

  return (
    <View style={styles.container} testID={testID}>
      {/* Language header */}
      <View style={styles.header}>
        <Text style={styles.languageLabel}>{language}</Text>
        <Text style={styles.lineCount}>
          {lineCount} {lineCount === 1 ? "line" : "lines"}
        </Text>
      </View>

      {/* Code content */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator
        style={styles.horizontalScroll}
        testID={`${testID}-scroll`}
      >
        <View style={styles.codeArea}>
          {lines.map((line, lineIndex) => (
            <View key={lineIndex} style={styles.lineRow}>
              {showLineNumbers && (
                <Text
                  style={[styles.lineNumber, { width: gutterWidth }]}
                  testID={`${testID}-ln-${lineIndex + 1}`}
                >
                  {lineIndex + 1}
                </Text>
              )}
              <Text style={styles.lineContent} selectable>
                {tokenizeLine(line).map((token, tokenIndex) => (
                  <Text
                    key={tokenIndex}
                    style={{ color: TOKEN_COLORS[token.type] }}
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
  languageLabel: {
    ...typography.label,
    color: colors.text.secondary,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  lineCount: {
    ...typography.caption,
    color: colors.text.tertiary,
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
