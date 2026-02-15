/**
 * FileViewerScreen - Renders file contents with type-appropriate formatting.
 *
 * MOB-009: File viewer
 *
 * Features:
 * - Markdown rendering for .md files (headings, bold, italic, code, lists)
 * - Syntax highlighting for code files (keywords, strings, comments, numbers)
 * - JSON pretty-printing with color-coded values
 * - Plain text rendering for other file types
 * - Scrollable for long files
 * - Share button to export file content
 * - Loading, error, and retry states
 * - File metadata (type, size, path) displayed in header
 *
 * Navigation:
 * - Reached from FileBrowserScreen by tapping a file/knowledge node
 * - Dynamic header title shows file name
 * - Share button in navigation header
 */
import React, { useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Pressable,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { colors, spacing, typography, borderRadius } from "../theme";
import { ActionButton } from "../components";
import { MarkdownRenderer } from "../components/MarkdownRenderer";
import { CodeRenderer } from "../components/CodeRenderer";
import { JsonRenderer } from "../components/JsonRenderer";
import { useFileViewer } from "../hooks/useFileViewer";
import type { NavigatorStackParamList } from "../types";

type Props = NativeStackScreenProps<NavigatorStackParamList, "FileViewer">;

/** Format file size to human-readable string */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileViewerScreen({
  route,
  navigation,
}: Props): React.JSX.Element {
  const { filePath } = route.params;
  const {
    file,
    fileType,
    languageLabel,
    fileName,
    loading,
    error,
    retry,
    shareFile,
    formattedContent,
  } = useFileViewer(filePath);

  // Set header title to file name and add share button
  useEffect(() => {
    navigation.setOptions({
      title: fileName,
      headerRight: () => (
        <Pressable
          onPress={shareFile}
          hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
          testID="file-viewer-share-button"
          style={headerStyles.shareButton}
        >
          <Text style={headerStyles.shareIcon}>{"\u21A9"}</Text>
        </Pressable>
      ),
    });
  }, [navigation, fileName, shareFile]);

  // Loading state
  if (loading) {
    return (
      <View style={styles.centerContainer} testID="file-viewer-loading">
        <ActivityIndicator size="large" color={colors.accent.yellow} />
        <Text style={styles.loadingText}>Loading file...</Text>
      </View>
    );
  }

  // Error state
  if (error) {
    return (
      <View style={styles.centerContainer} testID="file-viewer-error">
        <Text style={styles.errorTitle}>Could not load file</Text>
        <Text style={styles.errorMessage}>{error}</Text>
        <Text style={styles.errorPath}>{filePath}</Text>
        <ActionButton
          label="Try Again"
          onPress={retry}
          variant="primary"
          style={styles.retryButton}
          testID="file-viewer-retry-button"
        />
      </View>
    );
  }

  // Content loaded
  return (
    <View style={styles.container} testID="file-viewer-screen">
      {/* File metadata bar */}
      <View style={styles.metaBar} testID="file-viewer-meta">
        <View style={styles.metaLeft}>
          <View style={[styles.typeBadge, fileTypeBadgeColor(fileType)]}>
            <Text style={styles.typeBadgeText}>
              {fileType.toUpperCase()}
            </Text>
          </View>
          {fileType === "code" && (
            <Text style={styles.metaLanguage}>{languageLabel}</Text>
          )}
        </View>
        {file && (
          <Text style={styles.metaSize}>{formatFileSize(file.size)}</Text>
        )}
      </View>

      {/* File path */}
      <View style={styles.pathBar}>
        <Text style={styles.pathText} numberOfLines={2}>
          {filePath}
        </Text>
      </View>

      {/* Scrollable file content */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator
        testID="file-viewer-scroll"
      >
        {renderContent(fileType, formattedContent, languageLabel)}
      </ScrollView>
    </View>
  );
}

/** Render content based on detected file type */
function renderContent(
  fileType: string,
  content: string,
  languageLabel: string,
): React.JSX.Element {
  switch (fileType) {
    case "markdown":
      return (
        <View style={contentStyles.markdownContainer}>
          <MarkdownRenderer content={content} testID="file-viewer-markdown" />
        </View>
      );

    case "json":
      return <JsonRenderer content={content} testID="file-viewer-json" />;

    case "code":
      return (
        <CodeRenderer
          content={content}
          language={languageLabel}
          testID="file-viewer-code"
        />
      );

    default:
      return (
        <View style={contentStyles.textContainer}>
          <Text
            style={contentStyles.plainText}
            selectable
            testID="file-viewer-text"
          >
            {content}
          </Text>
        </View>
      );
  }
}

/** Get badge color style for file type */
function fileTypeBadgeColor(
  fileType: string,
): { backgroundColor: string } {
  switch (fileType) {
    case "markdown":
      return { backgroundColor: colors.accent.blue + "30" };
    case "json":
      return { backgroundColor: colors.accent.yellow + "30" };
    case "code":
      return { backgroundColor: colors.accent.purple + "30" };
    default:
      return { backgroundColor: colors.background.elevated };
  }
}

const headerStyles = StyleSheet.create({
  shareButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  shareIcon: {
    fontSize: 20,
    color: colors.accent.blue,
    fontWeight: "600",
  },
});

const contentStyles = StyleSheet.create({
  markdownContainer: {
    paddingHorizontal: spacing.lg,
  },
  textContainer: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  plainText: {
    ...typography.mono,
    color: colors.text.primary,
    lineHeight: 22,
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.background.primary,
    padding: spacing.xxl,
  },
  loadingText: {
    ...typography.bodySmall,
    marginTop: spacing.md,
  },
  errorTitle: {
    ...typography.title,
    fontSize: 20,
    marginBottom: spacing.sm,
  },
  errorMessage: {
    ...typography.bodySmall,
    textAlign: "center",
    marginBottom: spacing.sm,
  },
  errorPath: {
    ...typography.mono,
    color: colors.text.tertiary,
    fontSize: 11,
    textAlign: "center",
    marginBottom: spacing.lg,
  },
  retryButton: {
    minWidth: 120,
  },
  metaBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  metaLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  typeBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: borderRadius.sm,
  },
  typeBadgeText: {
    ...typography.label,
    color: colors.text.primary,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.8,
  },
  metaLanguage: {
    ...typography.label,
    color: colors.text.secondary,
  },
  metaSize: {
    ...typography.label,
    color: colors.text.tertiary,
  },
  pathBar: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    backgroundColor: colors.background.secondary,
  },
  pathText: {
    ...typography.caption,
    color: colors.text.tertiary,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: spacing.huge,
  },
});
