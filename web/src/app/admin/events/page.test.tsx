import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import AdminEventsPage from "./page";

const listEvents = vi.fn();

// The real useAuth returns a referentially stable user; a fresh object per
// render would change the identity of every [user] effect dep and spin the
// page into an endless refetch loop.
const ADMIN = { user: { id: "u1", role: "admin" }, isLoading: false };
vi.mock("@/hooks/useAdminGuard", () => ({ useAdminGuard: () => ADMIN }));

vi.mock("@/lib/api", () => ({
  adminApi: { games: { list: () => Promise.resolve({ data: { data: [] } }) } },
  eventsApi: {
    list: () => listEvents(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    setItems: vi.fn(),
    setServerTimes: vi.fn(),
    getServers: vi.fn(() => Promise.resolve({ data: { data: [] } })),
  },
  itemsApi: { listAll: vi.fn(() => Promise.resolve([])) },
  mediaApi: { upload: vi.fn() },
}));

const event = (over: Record<string, unknown> = {}) => ({
  id: "e1",
  game_id: "g1",
  game_slug: "genshin-impact",
  game_name: "Genshin Impact",
  event_type: "version",
  slug: "v5-3",
  title: "Version 5.3",
  description: null,
  image_url: "https://hotarumi.com/uploads/v5-3.webp",
  start_at: "2026-07-01T00:00:00Z",
  end_at: "2026-08-01T00:00:00Z",
  timezone: "UTC",
  is_published: true,
  featured_items: [],
  server_times: [],
  ...over,
});

const row = (title: string) => screen.getByText(title).closest("tr") as HTMLElement;

describe("admin events list thumbnails", () => {
  beforeEach(() => {
    listEvents.mockReset();
  });

  it("shows the banner image for a version row", async () => {
    listEvents.mockResolvedValue({ data: { data: [event()] } });

    render(<AdminEventsPage />);

    await waitFor(() => expect(screen.getByText("Version 5.3")).toBeInTheDocument());

    expect(within(row("Version 5.3")).getByAltText("Version 5.3 banner")).toHaveAttribute(
      "src",
      "https://hotarumi.com/uploads/v5-3.webp",
    );
  });

  it("shows a placeholder for an event with no image", async () => {
    listEvents.mockResolvedValue({
      data: { data: [event({ id: "e2", title: "Version 5.4", image_url: null })] },
    });

    render(<AdminEventsPage />);

    await waitFor(() => expect(screen.getByText("Version 5.4")).toBeInTheDocument());

    const cells = within(row("Version 5.4"));
    expect(cells.queryByAltText("Version 5.4 banner")).not.toBeInTheDocument();
    expect(cells.getByTitle("Banner image: not set")).toBeInTheDocument();
  });

  it("keeps body rows aligned with the header after adding the image column", async () => {
    listEvents.mockResolvedValue({
      data: {
        data: [event(), event({ id: "e3", title: "Version 5.4", image_url: null })],
      },
    });

    render(<AdminEventsPage />);

    await waitFor(() => expect(screen.getByText("Version 5.4")).toBeInTheDocument());

    const headerCells = screen.getAllByRole("columnheader").length;
    for (const title of ["Version 5.3", "Version 5.4"]) {
      expect(within(row(title)).getAllByRole("cell")).toHaveLength(headerCells);
    }
  });
});
