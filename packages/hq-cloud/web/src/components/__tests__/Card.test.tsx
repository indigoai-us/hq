import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Card } from "../Card";

describe("Card", () => {
  it("renders children text", () => {
    render(<Card>Hello World</Card>);
    expect(screen.getByText("Hello World")).toBeTruthy();
  });

  it("renders as a div when no onClick is provided", () => {
    const { container } = render(<Card>Content</Card>);
    expect(container.querySelector("div")).toBeTruthy();
    expect(container.querySelector("button")).toBeNull();
  });

  it("renders as a button when onClick is provided", () => {
    const handleClick = vi.fn();
    render(<Card onClick={handleClick}>Clickable</Card>);
    const button = screen.getByRole("button");
    expect(button).toBeTruthy();
    expect(button.textContent).toContain("Clickable");
  });

  it("calls onClick when the button is clicked", () => {
    const handleClick = vi.fn();
    render(<Card onClick={handleClick}>Click Me</Card>);
    fireEvent.click(screen.getByRole("button"));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it("applies the base card styles", () => {
    const { container } = render(<Card>Styled</Card>);
    const div = container.firstElementChild as HTMLElement;
    expect(div.className).toContain("bg-bg-card");
    expect(div.className).toContain("rounded-lg");
    expect(div.className).toContain("border");
  });

  it("applies custom className to the div variant", () => {
    const { container } = render(<Card className="my-custom-class">Custom</Card>);
    const div = container.firstElementChild as HTMLElement;
    expect(div.className).toContain("my-custom-class");
  });

  it("applies custom className to the button variant", () => {
    const handleClick = vi.fn();
    render(<Card onClick={handleClick} className="extra-class">Click</Card>);
    const button = screen.getByRole("button");
    expect(button.className).toContain("extra-class");
  });

  it("applies hover styles to the button variant", () => {
    const handleClick = vi.fn();
    render(<Card onClick={handleClick}>Hover</Card>);
    const button = screen.getByRole("button");
    expect(button.className).toContain("hover:bg-bg-elevated");
  });

  it("renders complex children", () => {
    render(
      <Card>
        <h1>Title</h1>
        <p>Description</p>
      </Card>,
    );
    expect(screen.getByText("Title")).toBeTruthy();
    expect(screen.getByText("Description")).toBeTruthy();
  });

  it("defaults className to empty string", () => {
    const { container } = render(<Card>Default</Card>);
    const div = container.firstElementChild as HTMLElement;
    expect(div.className).not.toContain("undefined");
    expect(div.className).not.toContain("null");
  });
});
