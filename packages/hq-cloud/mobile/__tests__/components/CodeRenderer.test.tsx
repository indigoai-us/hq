/**
 * Tests for CodeRenderer component.
 * Verifies line numbers, language header, syntax highlighting tokens,
 * and horizontal scroll container.
 */
import React from "react";
import { render } from "@testing-library/react-native";
import { CodeRenderer } from "../../src/components/CodeRenderer";

describe("CodeRenderer", () => {
  it("renders with testID", () => {
    const { getByTestId } = render(
      <CodeRenderer content="const x = 1;" language="TypeScript" testID="code" />,
    );
    expect(getByTestId("code")).toBeTruthy();
  });

  it("displays language label in header", () => {
    const { getByText } = render(
      <CodeRenderer content="const x = 1;" language="TypeScript" testID="code" />,
    );
    expect(getByText("TypeScript")).toBeTruthy();
  });

  it("displays line count", () => {
    const content = "line 1\nline 2\nline 3";
    const { getByText } = render(
      <CodeRenderer content={content} language="Text" testID="code" />,
    );
    expect(getByText("3 lines")).toBeTruthy();
  });

  it("displays singular line count", () => {
    const { getByText } = render(
      <CodeRenderer content="single line" language="Text" testID="code" />,
    );
    expect(getByText("1 line")).toBeTruthy();
  });

  it("shows line numbers by default", () => {
    const { getByTestId } = render(
      <CodeRenderer content={"line 1\nline 2"} language="Text" testID="code" />,
    );
    expect(getByTestId("code-ln-1")).toBeTruthy();
    expect(getByTestId("code-ln-2")).toBeTruthy();
  });

  it("hides line numbers when showLineNumbers=false", () => {
    const { queryByTestId } = render(
      <CodeRenderer
        content="line 1"
        language="Text"
        showLineNumbers={false}
        testID="code"
      />,
    );
    expect(queryByTestId("code-ln-1")).toBeNull();
  });

  it("renders horizontal scroll container", () => {
    const { getByTestId } = render(
      <CodeRenderer content="code" language="Text" testID="code" />,
    );
    expect(getByTestId("code-scroll")).toBeTruthy();
  });

  it("renders code content as selectable text", () => {
    const { getByText } = render(
      <CodeRenderer content="const hello = 'world';" language="JavaScript" testID="code" />,
    );
    // Keywords should be rendered
    expect(getByText("const")).toBeTruthy();
  });

  it("renders keywords with highlighting", () => {
    const { getByText } = render(
      <CodeRenderer content="function test() { return true; }" language="JavaScript" testID="code" />,
    );
    expect(getByText("function")).toBeTruthy();
    expect(getByText("return")).toBeTruthy();
    expect(getByText("true")).toBeTruthy();
  });

  it("renders strings in code", () => {
    const { getByText } = render(
      <CodeRenderer content={'const s = "hello";'} language="JavaScript" testID="code" />,
    );
    expect(getByText('"hello"')).toBeTruthy();
  });

  it("renders comments in code", () => {
    const { getByText } = render(
      <CodeRenderer content="// This is a comment" language="JavaScript" testID="code" />,
    );
    expect(getByText("// This is a comment")).toBeTruthy();
  });

  it("handles empty content", () => {
    const { getByTestId } = render(
      <CodeRenderer content="" language="Text" testID="code" />,
    );
    expect(getByTestId("code")).toBeTruthy();
  });

  it("handles multi-line code", () => {
    const content = "import React from 'react';\n\nfunction App() {\n  return null;\n}";
    const { getByText, getByTestId } = render(
      <CodeRenderer content={content} language="JavaScript" testID="code" />,
    );
    expect(getByText("5 lines")).toBeTruthy();
    expect(getByTestId("code-ln-5")).toBeTruthy();
  });
});
