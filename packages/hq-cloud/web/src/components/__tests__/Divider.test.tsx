import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Divider } from "../Divider";

describe("Divider", () => {
  it("renders a div element", () => {
    const { container } = render(<Divider />);
    expect(container.querySelector("div")).toBeTruthy();
  });

  it("has 1px height class", () => {
    const { container } = render(<Divider />);
    const div = container.firstElementChild as HTMLElement;
    expect(div.className).toContain("h-px");
  });

  it("has border-subtle background", () => {
    const { container } = render(<Divider />);
    const div = container.firstElementChild as HTMLElement;
    expect(div.className).toContain("bg-border-subtle");
  });

  it("applies custom className", () => {
    const { container } = render(<Divider className="my-4" />);
    const div = container.firstElementChild as HTMLElement;
    expect(div.className).toContain("my-4");
  });

  it("defaults className to empty string", () => {
    const { container } = render(<Divider />);
    const div = container.firstElementChild as HTMLElement;
    expect(div.className).not.toContain("undefined");
    expect(div.className).not.toContain("null");
  });

  it("renders with multiple custom classes", () => {
    const { container } = render(<Divider className="my-4 mx-2 opacity-50" />);
    const div = container.firstElementChild as HTMLElement;
    expect(div.className).toContain("my-4");
    expect(div.className).toContain("mx-2");
    expect(div.className).toContain("opacity-50");
  });
});
