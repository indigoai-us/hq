/**
 * Tests for TreeGroup component.
 * Verifies group header rendering, expand/collapse, and child node rendering.
 */
import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { TreeGroup } from "../../src/components/TreeGroup";
import type { NavigatorGroup } from "../../src/types";

const sampleGroup: NavigatorGroup = {
  id: "group-companies",
  name: "Companies",
  children: [
    {
      id: "company-stelo",
      name: "Stelo Labs Inc",
      type: "company",
      status: "healthy",
      children: [
        {
          id: "project-launch",
          name: "Product Launch",
          type: "project",
          status: "healthy",
          children: [
            {
              id: "worker-writer",
              name: "Launch Writer",
              type: "worker",
              status: "healthy",
            },
          ],
        },
      ],
    },
    {
      id: "company-holding",
      name: "Holding Co",
      type: "company",
      status: "healthy",
    },
  ],
};

const emptyGroup: NavigatorGroup = {
  id: "group-empty",
  name: "Empty Group",
  children: [],
};

const defaultProps = {
  expandedNodes: new Set<string>(),
  onToggle: jest.fn(),
  onOpenFile: jest.fn(),
};

describe("TreeGroup", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders group name", () => {
    const { getByText } = render(
      <TreeGroup group={sampleGroup} {...defaultProps} />,
    );
    expect(getByText("Companies")).toBeTruthy();
  });

  it("renders with testID", () => {
    const { getByTestId } = render(
      <TreeGroup group={sampleGroup} {...defaultProps} />,
    );
    expect(getByTestId("tree-group-group-companies")).toBeTruthy();
  });

  it("renders chevron", () => {
    const { getByTestId } = render(
      <TreeGroup group={sampleGroup} {...defaultProps} />,
    );
    expect(getByTestId("tree-group-group-companies-chevron")).toBeTruthy();
  });

  it("calls onToggle when header is pressed", () => {
    const onToggle = jest.fn();
    const { getByTestId } = render(
      <TreeGroup group={sampleGroup} {...defaultProps} onToggle={onToggle} />,
    );
    fireEvent.press(getByTestId("tree-group-group-companies-header"));
    expect(onToggle).toHaveBeenCalledWith("group-companies");
  });

  it("does not render children when collapsed", () => {
    const { queryByTestId } = render(
      <TreeGroup group={sampleGroup} {...defaultProps} />,
    );
    expect(queryByTestId("tree-group-group-companies-children")).toBeNull();
  });

  it("renders children when expanded", () => {
    const expandedNodes = new Set(["group-companies"]);
    const { getByTestId, getByText } = render(
      <TreeGroup
        group={sampleGroup}
        {...defaultProps}
        expandedNodes={expandedNodes}
      />,
    );
    expect(getByTestId("tree-group-group-companies-children")).toBeTruthy();
    expect(getByText("Stelo Labs Inc")).toBeTruthy();
    expect(getByText("Holding Co")).toBeTruthy();
  });

  it("renders deeply nested children when all ancestors are expanded", () => {
    const expandedNodes = new Set([
      "group-companies",
      "company-stelo",
      "project-launch",
    ]);
    const { getByText } = render(
      <TreeGroup
        group={sampleGroup}
        {...defaultProps}
        expandedNodes={expandedNodes}
      />,
    );
    expect(getByText("Companies")).toBeTruthy();
    expect(getByText("Stelo Labs Inc")).toBeTruthy();
    expect(getByText("Product Launch")).toBeTruthy();
    expect(getByText("Launch Writer")).toBeTruthy();
  });

  it("renders empty group with no children container when expanded", () => {
    const expandedNodes = new Set(["group-empty"]);
    const { getByTestId } = render(
      <TreeGroup
        group={emptyGroup}
        {...defaultProps}
        expandedNodes={expandedNodes}
      />,
    );
    const children = getByTestId("tree-group-group-empty-children");
    // Children container exists but has no child elements
    expect(children.children.length).toBe(0);
  });

  it("sets accessibility label for collapsed group", () => {
    const { getByLabelText } = render(
      <TreeGroup group={sampleGroup} {...defaultProps} />,
    );
    expect(getByLabelText("Companies, collapsed")).toBeTruthy();
  });

  it("sets accessibility label for expanded group", () => {
    const expandedNodes = new Set(["group-companies"]);
    const { getByLabelText } = render(
      <TreeGroup
        group={sampleGroup}
        {...defaultProps}
        expandedNodes={expandedNodes}
      />,
    );
    expect(getByLabelText("Companies, expanded")).toBeTruthy();
  });

  it("uses custom testIDPrefix", () => {
    const { getByTestId } = render(
      <TreeGroup
        group={sampleGroup}
        {...defaultProps}
        testIDPrefix="custom"
      />,
    );
    expect(getByTestId("custom-group-companies")).toBeTruthy();
  });
});
