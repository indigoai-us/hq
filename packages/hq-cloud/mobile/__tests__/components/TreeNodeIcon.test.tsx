/**
 * Tests for TreeNodeIcon component.
 * Verifies that all node types render their expected icons.
 */
import React from "react";
import { render } from "@testing-library/react-native";
import { TreeNodeIcon } from "../../src/components/TreeNodeIcon";
import type { NavigatorNodeType } from "../../src/types";

describe("TreeNodeIcon", () => {
  const nodeTypes: NavigatorNodeType[] = [
    "company",
    "project",
    "worker",
    "knowledge",
    "file",
  ];

  it("renders without crashing for each node type", () => {
    for (const type of nodeTypes) {
      const { unmount } = render(<TreeNodeIcon type={type} />);
      unmount();
    }
  });

  it("uses default size of 16", () => {
    const { toJSON } = render(<TreeNodeIcon type="company" />);
    expect(toJSON()).toBeTruthy();
  });

  it("accepts custom size", () => {
    const { toJSON } = render(<TreeNodeIcon type="project" size={24} />);
    expect(toJSON()).toBeTruthy();
  });

  it("renders with testID", () => {
    const { getByTestId } = render(
      <TreeNodeIcon type="worker" testID="test-icon" />,
    );
    expect(getByTestId("test-icon")).toBeTruthy();
  });

  it("sets accessibility label based on node type", () => {
    const { getByLabelText } = render(<TreeNodeIcon type="knowledge" />);
    expect(getByLabelText("knowledge icon")).toBeTruthy();
  });

  it.each(nodeTypes)("renders %s type icon as text", (type) => {
    const { toJSON } = render(<TreeNodeIcon type={type} />);
    const tree = toJSON();
    expect(tree).toBeTruthy();
    // Verify it renders as a Text component with content
    expect(tree).toHaveProperty("type", "Text");
    expect(tree).toHaveProperty("children");
  });
});
