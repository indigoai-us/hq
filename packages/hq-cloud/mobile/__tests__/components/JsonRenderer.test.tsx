/**
 * Tests for JsonRenderer component.
 * Verifies pretty-printing, syntax coloring, line numbers,
 * error handling for invalid JSON, and scroll container.
 */
import React from "react";
import { render } from "@testing-library/react-native";
import { JsonRenderer } from "../../src/components/JsonRenderer";

describe("JsonRenderer", () => {
  it("renders with testID", () => {
    const { getByTestId } = render(
      <JsonRenderer content='{"key": "value"}' testID="json" />,
    );
    expect(getByTestId("json")).toBeTruthy();
  });

  it("displays JSON label in header", () => {
    const { getByText } = render(
      <JsonRenderer content='{"key": "value"}' testID="json" />,
    );
    expect(getByText("JSON")).toBeTruthy();
  });

  it("displays line count for pretty-printed JSON", () => {
    const json = '{"name": "test", "value": 42}';
    // Pretty-printed will be 4 lines: {, name, value, }
    const { getByText } = render(
      <JsonRenderer content={json} testID="json" />,
    );
    expect(getByText("4 lines")).toBeTruthy();
  });

  it("pretty-prints compact JSON", () => {
    const json = '{"a":1,"b":2}';
    const { getByText } = render(
      <JsonRenderer content={json} testID="json" />,
    );
    // After pretty-printing, keys should be visible
    expect(getByText(/"a"/)).toBeTruthy();
    expect(getByText(/"b"/)).toBeTruthy();
  });

  it("renders string values", () => {
    const json = '{"name": "hello"}';
    const { getByText } = render(
      <JsonRenderer content={json} testID="json" />,
    );
    expect(getByText(/"hello"/)).toBeTruthy();
  });

  it("renders number values", () => {
    const json = '{"count": 42}';
    const { getByText } = render(
      <JsonRenderer content={json} testID="json" />,
    );
    expect(getByText("42")).toBeTruthy();
  });

  it("renders boolean values", () => {
    const json = '{"active": true, "deleted": false}';
    const { getByText } = render(
      <JsonRenderer content={json} testID="json" />,
    );
    expect(getByText("true")).toBeTruthy();
    expect(getByText("false")).toBeTruthy();
  });

  it("renders null values", () => {
    const json = '{"data": null}';
    const { getByText } = render(
      <JsonRenderer content={json} testID="json" />,
    );
    expect(getByText("null")).toBeTruthy();
  });

  it("renders horizontal scroll container", () => {
    const { getByTestId } = render(
      <JsonRenderer content='{"key": "value"}' testID="json" />,
    );
    expect(getByTestId("json-scroll")).toBeTruthy();
  });

  it("shows parse error for invalid JSON", () => {
    const { getByText } = render(
      <JsonRenderer content="{broken json" testID="json" />,
    );
    expect(getByText(/Parse error:/)).toBeTruthy();
  });

  it("still renders invalid JSON content as-is", () => {
    const invalid = "{broken json";
    const { getByText } = render(
      <JsonRenderer content={invalid} testID="json" />,
    );
    // The raw content should still be rendered
    expect(getByText(/{broken json/)).toBeTruthy();
  });

  it("handles empty JSON object", () => {
    const { getByTestId } = render(
      <JsonRenderer content="{}" testID="json" />,
    );
    expect(getByTestId("json")).toBeTruthy();
  });

  it("handles JSON array", () => {
    const json = '[10, 20, 30]';
    const { getByText } = render(
      <JsonRenderer content={json} testID="json" />,
    );
    expect(getByText("10")).toBeTruthy();
    expect(getByText("20")).toBeTruthy();
    expect(getByText("30")).toBeTruthy();
  });

  it("handles nested JSON", () => {
    const json = '{"outer": {"inner": "value"}}';
    const { getByText } = render(
      <JsonRenderer content={json} testID="json" />,
    );
    expect(getByText(/"outer"/)).toBeTruthy();
    expect(getByText(/"inner"/)).toBeTruthy();
    expect(getByText(/"value"/)).toBeTruthy();
  });
});
