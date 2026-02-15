import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AgentTypeIcon } from "../AgentTypeIcon";

describe("AgentTypeIcon", () => {
  it("renders research type with magnifying glass emoji", () => {
    render(<AgentTypeIcon type="research" />);
    expect(screen.getByText("\uD83D\uDD0D")).toBeTruthy();
  });

  it("renders content type with pencil emoji", () => {
    render(<AgentTypeIcon type="content" />);
    expect(screen.getByText("\u270F\uFE0F")).toBeTruthy();
  });

  it("renders ops type with gear emoji", () => {
    render(<AgentTypeIcon type="ops" />);
    expect(screen.getByText("\u2699\uFE0F")).toBeTruthy();
  });

  it("renders code type with laptop emoji", () => {
    render(<AgentTypeIcon type="code" />);
    expect(screen.getByText("\uD83D\uDCBB")).toBeTruthy();
  });

  it("renders social type with phone emoji", () => {
    render(<AgentTypeIcon type="social" />);
    expect(screen.getByText("\uD83D\uDCF1")).toBeTruthy();
  });

  it("uses default size of 32", () => {
    const { container } = render(<AgentTypeIcon type="code" />);
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.style.width).toBe("32px");
    expect(wrapper.style.height).toBe("32px");
  });

  it("supports custom size", () => {
    const { container } = render(<AgentTypeIcon type="code" size={48} />);
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.style.width).toBe("48px");
    expect(wrapper.style.height).toBe("48px");
  });

  it("scales emoji font size to half the container size", () => {
    const { container } = render(<AgentTypeIcon type="code" size={40} />);
    const emoji = container.querySelector("span") as HTMLElement;
    expect(emoji.style.fontSize).toBe("20px");
  });

  it("applies the correct background color for research", () => {
    const { container } = render(<AgentTypeIcon type="research" />);
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain("bg-accent-purple/20");
  });

  it("applies the correct background color for content", () => {
    const { container } = render(<AgentTypeIcon type="content" />);
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain("bg-accent-blue/20");
  });

  it("applies the correct background color for ops", () => {
    const { container } = render(<AgentTypeIcon type="ops" />);
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain("bg-accent-yellow/20");
  });

  it("applies the correct background color for code", () => {
    const { container } = render(<AgentTypeIcon type="code" />);
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain("bg-accent-green/20");
  });

  it("applies the correct background color for social", () => {
    const { container } = render(<AgentTypeIcon type="social" />);
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain("bg-accent-red/20");
  });

  it("falls back to code config for unknown type", () => {
    const { container } = render(<AgentTypeIcon type={"unknown" as never} />);
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain("bg-accent-green/20");
  });

  it("has flex items-center justify-center classes", () => {
    const { container } = render(<AgentTypeIcon type="code" />);
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain("flex");
    expect(wrapper.className).toContain("items-center");
    expect(wrapper.className).toContain("justify-center");
  });
});
