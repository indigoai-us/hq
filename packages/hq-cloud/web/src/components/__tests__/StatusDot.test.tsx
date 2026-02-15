import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusDot } from "../StatusDot";

describe("StatusDot", () => {
  it("renders with healthy status", () => {
    render(<StatusDot status="healthy" />);
    const dot = screen.getByLabelText("Status: healthy");
    expect(dot).toBeTruthy();
    expect(dot.className).toContain("bg-status-healthy");
  });

  it("renders with connected status", () => {
    render(<StatusDot status="connected" />);
    const dot = screen.getByLabelText("Status: connected");
    expect(dot.className).toContain("bg-status-healthy");
  });

  it("renders with warning status", () => {
    render(<StatusDot status="warning" />);
    const dot = screen.getByLabelText("Status: warning");
    expect(dot.className).toContain("bg-status-warning");
  });

  it("renders with connecting status", () => {
    render(<StatusDot status="connecting" />);
    const dot = screen.getByLabelText("Status: connecting");
    expect(dot.className).toContain("bg-status-warning");
  });

  it("renders with reconnecting status", () => {
    render(<StatusDot status="reconnecting" />);
    const dot = screen.getByLabelText("Status: reconnecting");
    expect(dot.className).toContain("bg-status-warning");
  });

  it("renders with error status", () => {
    render(<StatusDot status="error" />);
    const dot = screen.getByLabelText("Status: error");
    expect(dot.className).toContain("bg-status-error");
  });

  it("renders with idle status", () => {
    render(<StatusDot status="idle" />);
    const dot = screen.getByLabelText("Status: idle");
    expect(dot.className).toContain("bg-status-idle");
  });

  it("renders with disconnected status", () => {
    render(<StatusDot status="disconnected" />);
    const dot = screen.getByLabelText("Status: disconnected");
    expect(dot.className).toContain("bg-status-idle");
  });

  it("uses sm size by default", () => {
    render(<StatusDot status="healthy" />);
    const dot = screen.getByLabelText("Status: healthy");
    expect(dot.className).toContain("w-2");
    expect(dot.className).toContain("h-2");
  });

  it("supports md size", () => {
    render(<StatusDot status="healthy" size="md" />);
    const dot = screen.getByLabelText("Status: healthy");
    expect(dot.className).toContain("w-2.5");
    expect(dot.className).toContain("h-2.5");
  });

  it("renders as a span element", () => {
    const { container } = render(<StatusDot status="healthy" />);
    expect(container.querySelector("span")).toBeTruthy();
  });

  it("has rounded-full class", () => {
    render(<StatusDot status="healthy" />);
    const dot = screen.getByLabelText("Status: healthy");
    expect(dot.className).toContain("rounded-full");
  });

  it("falls back to idle color for unknown status", () => {
    render(<StatusDot status={"unknown" as never} />);
    const dot = screen.getByLabelText("Status: unknown");
    expect(dot.className).toContain("bg-status-idle");
  });
});
