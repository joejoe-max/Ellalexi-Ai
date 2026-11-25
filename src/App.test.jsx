import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import App from "./App.jsx";

describe("EllaBrief application foundation", () => {
  it("renders the product's primary message and responsible-use boundary", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: /understand what you're agreeing to/i })).toBeInTheDocument();
    expect(screen.getByText(/does not make the decision for you or replace a lawyer/i)).toBeInTheDocument();
  });

  it("provides a useful not-found page for unknown routes", () => {
    render(
      <MemoryRouter initialEntries={["/unknown-route"]}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByText(/404 · PAGE NOT FOUND/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /back to ellabrief/i })).toHaveAttribute("href", "/");
  });
});
