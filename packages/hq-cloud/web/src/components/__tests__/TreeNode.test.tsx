import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TreeNode } from "../TreeNode";
import type { NavigatorNode } from "@/types/navigator";

function makeNode(overrides: Partial<NavigatorNode> = {}): NavigatorNode {
  return {
    id: "node-1",
    name: "Test Node",
    type: "project",
    status: "healthy",
    ...overrides,
  };
}

describe("TreeNode", () => {
  const defaultProps = {
    depth: 0,
    expanded: false,
    onToggle: vi.fn(),
    onFileSelect: vi.fn(),
    expandedNodes: new Set<string>(),
  };

  it("renders the node name", () => {
    render(<TreeNode node={makeNode({ name: "My Project" })} {...defaultProps} />);
    expect(screen.getByText("My Project")).toBeTruthy();
  });

  it("renders a status dot for the node", () => {
    render(<TreeNode node={makeNode({ status: "healthy" })} {...defaultProps} />);
    expect(screen.getByLabelText("Status: healthy")).toBeTruthy();
  });

  it("renders a chevron for nodes with children", () => {
    const node = makeNode({
      children: [makeNode({ id: "child-1", name: "Child" })],
    });
    const { container } = render(<TreeNode node={node} {...defaultProps} />);
    expect(container.textContent).toContain("\u25B6");
  });

  it("does not render a chevron for leaf nodes", () => {
    const { container } = render(
      <TreeNode node={makeNode({ children: undefined })} {...defaultProps} />,
    );
    const firstButton = container.querySelector("button") as HTMLElement;
    expect(firstButton.textContent).not.toContain("\u25B6");
  });

  it("calls onToggle when a parent node is clicked", () => {
    const onToggle = vi.fn();
    const node = makeNode({
      id: "parent-1",
      children: [makeNode({ id: "child-1", name: "Child" })],
    });
    render(<TreeNode node={node} {...defaultProps} onToggle={onToggle} />);
    fireEvent.click(screen.getByText("Test Node"));
    expect(onToggle).toHaveBeenCalledWith("parent-1");
  });

  it("calls onFileSelect when a file node is clicked", () => {
    const onFileSelect = vi.fn();
    const node = makeNode({
      type: "file",
      filePath: "/src/index.ts",
    });
    render(<TreeNode node={node} {...defaultProps} onFileSelect={onFileSelect} />);
    fireEvent.click(screen.getByText("Test Node"));
    expect(onFileSelect).toHaveBeenCalledWith("/src/index.ts");
  });

  it("does not call onFileSelect for non-file nodes", () => {
    const onFileSelect = vi.fn();
    const node = makeNode({ type: "project" });
    render(<TreeNode node={node} {...defaultProps} onFileSelect={onFileSelect} />);
    fireEvent.click(screen.getByText("Test Node"));
    expect(onFileSelect).not.toHaveBeenCalled();
  });

  it("renders children when expanded and has children", () => {
    const node = makeNode({
      children: [
        makeNode({ id: "child-1", name: "Child Node" }),
      ],
    });
    render(
      <TreeNode
        node={node}
        {...defaultProps}
        expanded={true}
        expandedNodes={new Set(["child-1"])}
      />,
    );
    expect(screen.getByText("Child Node")).toBeTruthy();
  });

  it("does not render children when collapsed", () => {
    const node = makeNode({
      children: [
        makeNode({ id: "child-1", name: "Child Node" }),
      ],
    });
    render(<TreeNode node={node} {...defaultProps} expanded={false} />);
    expect(screen.queryByText("Child Node")).toBeNull();
  });

  it("applies depth-based indentation", () => {
    const { container } = render(
      <TreeNode node={makeNode()} {...defaultProps} depth={3} />,
    );
    const button = container.querySelector("button") as HTMLElement;
    // depth * 16 + 8 = 3 * 16 + 8 = 56px
    expect(button.style.paddingLeft).toBe("56px");
  });

  it("applies zero-depth indentation", () => {
    const { container } = render(
      <TreeNode node={makeNode()} {...defaultProps} depth={0} />,
    );
    const button = container.querySelector("button") as HTMLElement;
    // 0 * 16 + 8 = 8px
    expect(button.style.paddingLeft).toBe("8px");
  });

  it("renders rotate-90 on chevron when expanded", () => {
    const node = makeNode({
      children: [makeNode({ id: "child-1", name: "Child" })],
    });
    const { container } = render(
      <TreeNode node={node} {...defaultProps} expanded={true} />,
    );
    const chevron = container.querySelector(".text-text-tertiary.text-xs") as HTMLElement;
    expect(chevron.className).toContain("rotate-90");
  });

  it("does not rotate chevron when collapsed", () => {
    const node = makeNode({
      children: [makeNode({ id: "child-1", name: "Child" })],
    });
    const { container } = render(
      <TreeNode node={node} {...defaultProps} expanded={false} />,
    );
    const chevron = container.querySelector(".text-text-tertiary.text-xs") as HTMLElement;
    expect(chevron.className).not.toContain("rotate-90");
  });

  it("renders children recursively at increased depth", () => {
    const grandchild = makeNode({ id: "gc-1", name: "Grandchild" });
    const child = makeNode({ id: "child-1", name: "Child", children: [grandchild] });
    const node = makeNode({ children: [child] });

    render(
      <TreeNode
        node={node}
        {...defaultProps}
        expanded={true}
        expandedNodes={new Set(["child-1"])}
      />,
    );
    expect(screen.getByText("Child")).toBeTruthy();
    expect(screen.getByText("Grandchild")).toBeTruthy();
  });

  it("renders with w-full class on button", () => {
    const { container } = render(
      <TreeNode node={makeNode()} {...defaultProps} />,
    );
    const button = container.querySelector("button") as HTMLElement;
    expect(button.className).toContain("w-full");
  });
});
