/**
 * Tests for MarkdownRenderer component.
 * Verifies rendering of headings, paragraphs, code blocks, lists,
 * blockquotes, horizontal rules, and inline formatting.
 */
import React from "react";
import { render } from "@testing-library/react-native";
import { MarkdownRenderer } from "../../src/components/MarkdownRenderer";

describe("MarkdownRenderer", () => {
  it("renders the container with testID", () => {
    const { getByTestId } = render(
      <MarkdownRenderer content="Hello" testID="md" />,
    );
    expect(getByTestId("md")).toBeTruthy();
  });

  it("renders headings at different levels", () => {
    const content = "# Heading 1\n## Heading 2\n### Heading 3";
    const { getByText } = render(
      <MarkdownRenderer content={content} testID="md" />,
    );
    expect(getByText("Heading 1")).toBeTruthy();
    expect(getByText("Heading 2")).toBeTruthy();
    expect(getByText("Heading 3")).toBeTruthy();
  });

  it("renders heading testIDs", () => {
    const content = "# Title";
    const { getByTestId } = render(
      <MarkdownRenderer content={content} testID="md" />,
    );
    expect(getByTestId("md-heading-0")).toBeTruthy();
  });

  it("renders paragraphs", () => {
    const content = "This is a paragraph.\n\nThis is another paragraph.";
    const { getByText } = render(
      <MarkdownRenderer content={content} testID="md" />,
    );
    expect(getByText("This is a paragraph.")).toBeTruthy();
    expect(getByText("This is another paragraph.")).toBeTruthy();
  });

  it("renders fenced code blocks", () => {
    const content = "```typescript\nconst x = 1;\n```";
    const { getByTestId, getByText } = render(
      <MarkdownRenderer content={content} testID="md" />,
    );
    expect(getByTestId("md-code-0")).toBeTruthy();
    expect(getByText("typescript")).toBeTruthy();
    expect(getByText("const x = 1;")).toBeTruthy();
  });

  it("renders code blocks without language", () => {
    const content = "```\nplain code\n```";
    const { getByText } = render(
      <MarkdownRenderer content={content} testID="md" />,
    );
    expect(getByText("plain code")).toBeTruthy();
  });

  it("renders unordered list items", () => {
    const content = "- Item one\n- Item two\n- Item three";
    const { getByText } = render(
      <MarkdownRenderer content={content} testID="md" />,
    );
    expect(getByText("Item one")).toBeTruthy();
    expect(getByText("Item two")).toBeTruthy();
    expect(getByText("Item three")).toBeTruthy();
  });

  it("renders ordered list items", () => {
    const content = "1. First\n2. Second\n3. Third";
    const { getByText } = render(
      <MarkdownRenderer content={content} testID="md" />,
    );
    expect(getByText("First")).toBeTruthy();
    expect(getByText("Second")).toBeTruthy();
    expect(getByText("Third")).toBeTruthy();
  });

  it("renders ordered list with numbers", () => {
    const content = "1. First\n2. Second";
    const { getByText } = render(
      <MarkdownRenderer content={content} testID="md" />,
    );
    expect(getByText("1.")).toBeTruthy();
    expect(getByText("2.")).toBeTruthy();
  });

  it("renders bullet points for unordered list", () => {
    const content = "- Item";
    const { getByText } = render(
      <MarkdownRenderer content={content} testID="md" />,
    );
    // Unicode bullet character
    expect(getByText("\u2022")).toBeTruthy();
  });

  it("renders blockquotes", () => {
    const content = "> This is a quote";
    const { getByText } = render(
      <MarkdownRenderer content={content} testID="md" />,
    );
    expect(getByText("This is a quote")).toBeTruthy();
  });

  it("renders horizontal rules", () => {
    const content = "Before\n\n---\n\nAfter";
    const { getByText } = render(
      <MarkdownRenderer content={content} testID="md" />,
    );
    expect(getByText("Before")).toBeTruthy();
    expect(getByText("After")).toBeTruthy();
  });

  it("renders bold text", () => {
    const content = "This has **bold** text";
    const { getByText } = render(
      <MarkdownRenderer content={content} testID="md" />,
    );
    expect(getByText("bold")).toBeTruthy();
  });

  it("renders italic text", () => {
    const content = "This has *italic* text";
    const { getByText } = render(
      <MarkdownRenderer content={content} testID="md" />,
    );
    expect(getByText("italic")).toBeTruthy();
  });

  it("renders inline code", () => {
    const content = "Run `npm install` to start";
    const { getByText } = render(
      <MarkdownRenderer content={content} testID="md" />,
    );
    expect(getByText("npm install")).toBeTruthy();
  });

  it("renders link text", () => {
    const content = "Visit [Google](https://google.com) for search";
    const { getByText } = render(
      <MarkdownRenderer content={content} testID="md" />,
    );
    expect(getByText("Google")).toBeTruthy();
  });

  it("handles empty content", () => {
    const { getByTestId } = render(
      <MarkdownRenderer content="" testID="md" />,
    );
    expect(getByTestId("md")).toBeTruthy();
  });

  it("handles complex markdown document", () => {
    const content = [
      "# Title",
      "",
      "A paragraph with **bold** and *italic*.",
      "",
      "## Section",
      "",
      "- Item 1",
      "- Item 2",
      "",
      "> A quote",
      "",
      "```js",
      "const x = 1;",
      "```",
      "",
      "---",
      "",
      "Final paragraph.",
    ].join("\n");

    const { getByText } = render(
      <MarkdownRenderer content={content} testID="md" />,
    );
    expect(getByText("Title")).toBeTruthy();
    expect(getByText("Section")).toBeTruthy();
    expect(getByText("Item 1")).toBeTruthy();
    expect(getByText("A quote")).toBeTruthy();
    expect(getByText("const x = 1;")).toBeTruthy();
    expect(getByText("Final paragraph.")).toBeTruthy();
  });
});
