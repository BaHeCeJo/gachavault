import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import GamePageClient from "./GamePageClient";

// Building a collection is the one high-volume action on this page — you tick
// dozens of items in a row — so these cover the loop end to end: open the tab,
// expand a section, toggle a card, and see the counters move.

interface Entry {
  item_id: string;
  game_id: string;
  owned: boolean;
}

const upsertEntry = vi.fn((_id: string, _body: unknown) =>
  Promise.resolve({ data: { data: {} } }),
);
const deleteEntry = vi.fn((_id: string) => Promise.resolve({ data: { data: {} } }));
const getByGame = vi.fn(
  (): Promise<{ data: { data: Entry[] } }> => Promise.resolve({ data: { data: [] } }),
);

const USER = { user: { id: "u1", username: "tester", role: "user" }, isLoading: false };
vi.mock("@/context/AuthContext", () => ({ useAuth: () => USER }));

vi.mock("next-intl", () => ({
  useTranslations: () => (k: string) => k,
  useLocale: () => "en",
}));

vi.mock("@/lib/api", () => ({
  collectionsApi: {
    getByGame: () => getByGame(),
    upsertEntry: (id: string, body: unknown) => upsertEntry(id, body),
    deleteEntry: (id: string) => deleteEntry(id),
  },
  eventsApi: { list: vi.fn(() => Promise.resolve({ data: { data: [] } })) },
  itemsApi: {
    listAll: vi.fn(() =>
      Promise.resolve([
        { id: "i1", slug: "amber", section_id: "s1", data: { name: "Amber" } },
        { id: "i2", slug: "lyney", section_id: "s1", data: { name: "Lyney" } },
      ]),
    ),
    list: vi.fn(() => Promise.resolve({ data: { data: [] } })),
  },
  tierlistsApi: {
    listPublicForGame: vi.fn(() => Promise.resolve({ data: { data: [] } })),
  },
}));

const bundle = {
  game: { id: "g1", slug: "genshin-impact", name: "Genshin Impact" },
  sections: [{ id: "s1", slug: "characters", name: "Characters" }],
  attributes: [],
  schemas: [],
  initialSectionId: "s1",
  initialItems: [],
  itemCountsBySection: { s1: 2 },
  totalItems: 2,
  locale: "en",
};

const click = async (el: HTMLElement) => {
  await act(async () => {
    fireEvent.click(el);
  });
};

const openCollectionTab = async () => {
  render(<GamePageClient initial={bundle as never} />);
  await click(screen.getByRole("button", { name: /collection/i }));
  return waitFor(() => screen.getByRole("button", { name: /Characters/ }));
};

describe("collection tab bulk toggle", () => {
  beforeEach(() => {
    upsertEntry.mockClear();
    deleteEntry.mockClear();
    getByGame.mockClear();
  });

  it("hides the item grid until its section is expanded", async () => {
    const section = await openCollectionTab();

    expect(screen.queryByRole("button", { name: "+ Own" })).toBeNull();
    await click(section);
    expect(await screen.findAllByRole("button", { name: "+ Own" })).toHaveLength(2);
  });

  it("marks an item owned and moves the counter without waiting for the server", async () => {
    const section = await openCollectionTab();
    await click(section);

    expect(screen.getByText("0")).toBeInTheDocument();
    const [firstOwn] = await screen.findAllByRole("button", { name: "+ Own" });
    await click(firstOwn);

    // Card flips and the tally follows immediately — the request is behind it.
    expect(await screen.findByRole("button", { name: "✓ Owned" })).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(upsertEntry).toHaveBeenCalledWith("i1", { game_id: "g1", owned: true });
  });

  it("puts the card back when the write fails", async () => {
    upsertEntry.mockRejectedValueOnce(new Error("offline"));
    const section = await openCollectionTab();
    await click(section);

    const [firstOwn] = await screen.findAllByRole("button", { name: "+ Own" });
    await click(firstOwn);

    await waitFor(() => expect(screen.getAllByRole("button", { name: "+ Own" })).toHaveLength(2));
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("removes the entry when un-owning", async () => {
    getByGame.mockResolvedValueOnce({
      data: { data: [{ item_id: "i1", game_id: "g1", owned: true }] },
    });
    const section = await openCollectionTab();
    await click(section);

    await click(await screen.findByRole("button", { name: "✓ Owned" }));
    expect(deleteEntry).toHaveBeenCalledWith("i1");
  });
});
