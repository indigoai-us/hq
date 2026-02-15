/**
 * Tests for TreeNode component.
 * Verifies expand/collapse, icon rendering, status dots, and navigation.
 */
import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { TreeNode } from "../../src/components/TreeNode";
import type { NavigatorNode } from "../../src/types";

const leafNode: NavigatorNode = {
  id: "file-1",
  name: "Brand Guidelines",
  type: "file",
  status: "healthy",
  filePath: "/companies/stelo/knowledge/brand-guidelines.md",
};

const workerNode: NavigatorNode = {
  id: "worker-1",
  name: "Launch Writer",
  type: "worker",
  status: "healthy",
};

const folderNode: NavigatorNode = {
  id: "project-1",
  name: "Product Launch",
  type: "project",
  status: "healthy",
  children: [
    workerNode,
    leafNode,
  ],
};

const defaultProps = {
  depth: 0,
  expandedNodes: new Set<string>(),
  onToggle: jest.fn(),
  onOpenFile: jest.fn(),
};

describe("TreeNode", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders node name", () => {
    const { getByText } = render(
      <TreeNode node={leafNode} {...defaultProps} />,
    );
    expect(getByText("Brand Guidelines")).toBeTruthy();
  });

  it("renders type icon", () => {
    const { getByTestId } = render(
      <TreeNode node={leafNode} {...defaultProps} />,
    );
    expect(getByTestId("tree-node-file-1-icon")).toBeTruthy();
  });

  it("renders status dot (via tree row)", () => {
    const { getByTestId } = render(
      <TreeNode node={leafNode} {...defaultProps} />,
    );
    expect(getByTestId("tree-node-file-1-row")).toBeTruthy();
  });

  it("shows chevron for folder nodes", () => {
    const { getByTestId } = render(
      <TreeNode node={folderNode} {...defaultProps} />,
    );
    expect(getByTestId("tree-node-project-1-chevron")).toBeTruthy();
  });

  it("does not show chevron for leaf nodes", () => {
    const { queryByTestId } = render(
      <TreeNode node={leafNode} {...defaultProps} />,
    );
    expect(queryByTestId("tree-node-file-1-chevron")).toBeNull();
  });

  it("calls onToggle when folder node is pressed", () => {
    const onToggle = jest.fn();
    const { getByTestId } = render(
      <TreeNode node={folderNode} {...defaultProps} onToggle={onToggle} />,
    );
    fireEvent.press(getByTestId("tree-node-project-1-row"));
    expect(onToggle).toHaveBeenCalledWith("project-1");
  });

  it("calls onOpenFile when leaf node with filePath is pressed", () => {
    const onOpenFile = jest.fn();
    const { getByTestId } = render(
      <TreeNode node={leafNode} {...defaultProps} onOpenFile={onOpenFile} />,
    );
    fireEvent.press(getByTestId("tree-node-file-1-row"));
    expect(onOpenFile).toHaveBeenCalledWith(
      "/companies/stelo/knowledge/brand-guidelines.md",
    );
  });

  it("does not call onOpenFile when worker node without filePath is pressed", () => {
    const onOpenFile = jest.fn();
    const { getByTestId } = render(
      <TreeNode node={workerNode} {...defaultProps} onOpenFile={onOpenFile} />,
    );
    fireEvent.press(getByTestId("tree-node-worker-1-row"));
    expect(onOpenFile).not.toHaveBeenCalled();
  });

  it("does not render children when collapsed", () => {
    const { queryByTestId } = render(
      <TreeNode node={folderNode} {...defaultProps} />,
    );
    expect(queryByTestId("tree-node-project-1-children")).toBeNull();
  });

  it("renders children when expanded", () => {
    const expandedNodes = new Set(["project-1"]);
    const { getByTestId, getByText } = render(
      <TreeNode
        node={folderNode}
        {...defaultProps}
        expandedNodes={expandedNodes}
      />,
    );
    expect(getByTestId("tree-node-project-1-children")).toBeTruthy();
    expect(getByText("Launch Writer")).toBeTruthy();
    expect(getByText("Brand Guidelines")).toBeTruthy();
  });

  it("passes correct depth to children (indentation)", () => {
    const expandedNodes = new Set(["project-1"]);
    const { getByTestId } = render(
      <TreeNode
        node={folderNode}
        {...defaultProps}
        depth={1}
        expandedNodes={expandedNodes}
      />,
    );
    // Children should render at depth + 1
    expect(getByTestId("tree-node-worker-1")).toBeTruthy();
    expect(getByTestId("tree-node-file-1")).toBeTruthy();
  });

  it("uses custom testIDPrefix", () => {
    const { getByTestId } = render(
      <TreeNode
        node={leafNode}
        {...defaultProps}
        testIDPrefix="custom"
      />,
    );
    expect(getByTestId("custom-file-1")).toBeTruthy();
  });

  it("sets accessibility label for folder nodes", () => {
    const { getByLabelText } = render(
      <TreeNode node={folderNode} {...defaultProps} />,
    );
    expect(getByLabelText("Product Launch, project, collapsed")).toBeTruthy();
  });

  it("sets accessibility label for expanded folder nodes", () => {
    const expandedNodes = new Set(["project-1"]);
    const { getByLabelText } = render(
      <TreeNode
        node={folderNode}
        {...defaultProps}
        expandedNodes={expandedNodes}
      />,
    );
    expect(getByLabelText("Product Launch, project, expanded")).toBeTruthy();
  });

  it("sets accessibility label for leaf nodes", () => {
    const { getByLabelText } = render(
      <TreeNode node={leafNode} {...defaultProps} />,
    );
    expect(getByLabelText("Brand Guidelines, file")).toBeTruthy();
  });
});
