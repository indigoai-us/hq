import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PermissionPrompt } from "../PermissionPrompt";
import type { AgentPermissionRequest } from "@/types/agent";

function makePermission(overrides: Partial<AgentPermissionRequest> = {}): AgentPermissionRequest {
  return {
    id: "perm-1",
    tool: "write_file",
    description: "Write to /src/index.ts",
    requestedAt: "2025-01-15T10:00:00Z",
    ...overrides,
  };
}

describe("PermissionPrompt", () => {
  it("renders 'Permission Requested' label", () => {
    render(
      <PermissionPrompt permission={makePermission()} onRespond={vi.fn()} />,
    );
    expect(screen.getByText("Permission Requested")).toBeTruthy();
  });

  it("renders the tool name", () => {
    render(
      <PermissionPrompt permission={makePermission({ tool: "delete_file" })} onRespond={vi.fn()} />,
    );
    expect(screen.getByText("delete_file")).toBeTruthy();
  });

  it("renders the description", () => {
    render(
      <PermissionPrompt
        permission={makePermission({ description: "Delete /tmp/test.txt" })}
        onRespond={vi.fn()}
      />,
    );
    expect(screen.getByText("Delete /tmp/test.txt")).toBeTruthy();
  });

  it("renders Allow and Deny buttons", () => {
    render(
      <PermissionPrompt permission={makePermission()} onRespond={vi.fn()} />,
    );
    expect(screen.getByText("Allow")).toBeTruthy();
    expect(screen.getByText("Deny")).toBeTruthy();
  });

  it("calls onRespond with (id, true) when Allow is clicked", () => {
    const handleRespond = vi.fn();
    render(
      <PermissionPrompt
        permission={makePermission({ id: "perm-42" })}
        onRespond={handleRespond}
      />,
    );
    fireEvent.click(screen.getByText("Allow"));
    expect(handleRespond).toHaveBeenCalledWith("perm-42", true);
  });

  it("calls onRespond with (id, false) when Deny is clicked", () => {
    const handleRespond = vi.fn();
    render(
      <PermissionPrompt
        permission={makePermission({ id: "perm-42" })}
        onRespond={handleRespond}
      />,
    );
    fireEvent.click(screen.getByText("Deny"));
    expect(handleRespond).toHaveBeenCalledWith("perm-42", false);
  });

  it("disables both buttons when sending is true", () => {
    render(
      <PermissionPrompt permission={makePermission()} onRespond={vi.fn()} sending />,
    );
    expect((screen.getByText("Allow") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByText("Deny") as HTMLButtonElement).disabled).toBe(true);
  });

  it("buttons are enabled when sending is false", () => {
    render(
      <PermissionPrompt permission={makePermission()} onRespond={vi.fn()} sending={false} />,
    );
    expect((screen.getByText("Allow") as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByText("Deny") as HTMLButtonElement).disabled).toBe(false);
  });

  it("shows 'Allow <tool>?' text with tool name in bold", () => {
    render(
      <PermissionPrompt permission={makePermission({ tool: "execute_command" })} onRespond={vi.fn()} />,
    );
    const strongEl = screen.getByText("execute_command");
    expect(strongEl.tagName).toBe("STRONG");
  });

  it("has yellow border styling", () => {
    const { container } = render(
      <PermissionPrompt permission={makePermission()} onRespond={vi.fn()} />,
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain("border-accent-yellow/30");
  });
});
