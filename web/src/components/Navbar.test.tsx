import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Navbar } from "./Navbar";

let pathname = "/games";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push: vi.fn() }),
}));

// Signed out keeps the drawer's auth branch simple; none of these behaviours
// depend on which branch renders.
vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ user: null, isLoading: false, logout: vi.fn() }),
}));

vi.mock("./LanguageSwitcher", () => ({ default: () => <div /> }));

const openMenu = () => fireEvent.click(screen.getByLabelText("Open menu"));
const drawerIsOpen = () => screen.queryByLabelText("Close menu") !== null;

describe("Navbar mobile drawer", () => {
  beforeEach(() => {
    pathname = "/games";
    // jsdom has no matchMedia; the drawer effect subscribes to the md breakpoint.
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.style.overflow = "";
  });

  it("closes when the route changes, not just on link taps", () => {
    const { rerender } = render(<Navbar />);
    openMenu();
    expect(drawerIsOpen()).toBe(true);

    // Simulates browser back/forward: the pathname changes with no link click.
    pathname = "/banners";
    rerender(<Navbar />);

    expect(drawerIsOpen()).toBe(false);
  });

  it("closes on Escape", () => {
    render(<Navbar />);
    openMenu();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(drawerIsOpen()).toBe(false);
  });

  it("closes when pointing outside the header", () => {
    render(<Navbar />);
    openMenu();

    fireEvent.pointerDown(document.body);

    expect(drawerIsOpen()).toBe(false);
  });

  it("stays open when pointing inside the drawer", () => {
    render(<Navbar />);
    openMenu();

    // Both navs render in jsdom (`md:hidden` is CSS-only); the drawer's copy
    // is the later one in the DOM.
    const inDrawer = screen.getAllByText("Tier Lists").at(-1) as HTMLElement;
    fireEvent.pointerDown(inDrawer);

    expect(drawerIsOpen()).toBe(true);
  });

  it("locks body scroll while open and restores it on close", () => {
    render(<Navbar />);
    expect(document.body.style.overflow).toBe("");

    openMenu();
    expect(document.body.style.overflow).toBe("hidden");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(document.body.style.overflow).toBe("");
  });
});
