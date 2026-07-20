import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import AdminGamesPage from "./page";

const listGames = vi.fn();

vi.mock("@/hooks/useAdminGuard", () => ({
  useAdminGuard: () => ({ user: { id: "u1", role: "admin" }, isLoading: false }),
}));

vi.mock("@/lib/api", () => ({
  adminApi: {
    games: {
      list: () => listGames(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
  mediaApi: { upload: vi.fn() },
}));

vi.mock("@/lib/revalidate", () => ({
  revalidateGame: vi.fn(),
  revalidatePaths: vi.fn(),
}));

const game = (over: Record<string, unknown> = {}) => ({
  id: "g1",
  slug: "genshin-impact",
  name: "Genshin Impact",
  description: null,
  logo_url: "https://hotarumi.com/uploads/genshin-logo.webp",
  banner_url: "https://hotarumi.com/uploads/genshin-banner.webp",
  is_active: true,
  ...over,
});

const row = (name: string) => screen.getByText(name).closest("tr") as HTMLElement;

describe("admin games list thumbnails", () => {
  beforeEach(() => {
    listGames.mockReset();
  });

  it("shows the banner and logo previews for a game that has both", async () => {
    listGames.mockResolvedValue({ data: { data: [game()] } });

    render(<AdminGamesPage />);

    await waitFor(() => expect(screen.getByText("Genshin Impact")).toBeInTheDocument());

    const cells = within(row("Genshin Impact"));
    expect(cells.getByAltText("Genshin Impact banner")).toHaveAttribute(
      "src",
      "https://hotarumi.com/uploads/genshin-banner.webp",
    );
    expect(cells.getByAltText("Genshin Impact logo")).toHaveAttribute(
      "src",
      "https://hotarumi.com/uploads/genshin-logo.webp",
    );
  });

  it("shows a per-slot placeholder for the images a game is missing", async () => {
    listGames.mockResolvedValue({
      data: { data: [game({ id: "g2", name: "Wuthering Waves", logo_url: null })] },
    });

    render(<AdminGamesPage />);

    await waitFor(() => expect(screen.getByText("Wuthering Waves")).toBeInTheDocument());

    const cells = within(row("Wuthering Waves"));
    expect(cells.getByAltText("Wuthering Waves banner")).toBeInTheDocument();
    expect(cells.queryByAltText("Wuthering Waves logo")).not.toBeInTheDocument();
    expect(cells.getByTitle("Logo: not set")).toBeInTheDocument();
  });

  it("keeps every row aligned when games differ in which slots are filled", async () => {
    listGames.mockResolvedValue({
      data: {
        data: [
          game(),
          game({ id: "g3", slug: "hsr", name: "Star Rail", logo_url: null, banner_url: null }),
        ],
      },
    });

    render(<AdminGamesPage />);

    await waitFor(() => expect(screen.getByText("Star Rail")).toBeInTheDocument());

    // The header gained a leading image column, so every body row must have the
    // same cell count as the header or the table skews.
    const headerCells = screen.getAllByRole("columnheader").length;
    for (const name of ["Genshin Impact", "Star Rail"]) {
      expect(within(row(name)).getAllByRole("cell")).toHaveLength(headerCells);
    }

    const starRail = within(row("Star Rail"));
    expect(starRail.getByTitle("Banner: not set")).toBeInTheDocument();
    expect(starRail.getByTitle("Logo: not set")).toBeInTheDocument();
  });
});
