import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  gamesApi,
  itemsApi,
  collectionsApi,
  tierlistsApi,
  searchApi,
  mediaApi,
  usersApi,
  adminApi,
  authApi,
  eventsApi,
  checklistApi,
  type EventsQueryParams,
} from "@/lib/api";

// ── Games ────────────────────────────────────────────────────────────────────

export const useGames = (includeInactive = false, locale?: string) =>
  useQuery({
    queryKey: ["games", includeInactive, locale],
    queryFn: () => gamesApi.list(includeInactive, locale).then((r) => r.data.data),
  });

export const useGame = (slug: string, locale?: string) =>
  useQuery({
    queryKey: ["game", slug, locale],
    queryFn: () => gamesApi.get(slug, locale).then((r) => r.data.data),
    enabled: !!slug,
  });

export const useGameSections = (slug: string) =>
  useQuery({
    queryKey: ["game-sections", slug],
    queryFn: () => gamesApi.getSections(slug).then((r) => r.data.data),
    enabled: !!slug,
  });

export const useGameAttributes = (slug: string, attrType?: string) =>
  useQuery({
    queryKey: ["game-attributes", slug, attrType],
    queryFn: () => gamesApi.getAttributes(slug, attrType).then((r) => r.data.data),
    enabled: !!slug,
  });

export const useGameSchemas = (slug: string) =>
  useQuery({
    queryKey: ["game-schemas", slug],
    queryFn: () => gamesApi.listSchemas(slug).then((r) => r.data.data),
    enabled: !!slug,
  });

export const useGameTranslations = (slug: string) =>
  useQuery({
    queryKey: ["game-translations", slug],
    queryFn: () => gamesApi.listTranslations(slug).then((r) => r.data.data),
    enabled: !!slug,
  });

// ── Items ────────────────────────────────────────────────────────────────────

export const useGameItems = (
  gameSlug: string,
  params?: { section_id?: string; limit?: number; offset?: number }
) =>
  useQuery({
    queryKey: ["game-items", gameSlug, params],
    queryFn: () => itemsApi.listByGame(gameSlug, params).then((r) => r.data.data),
    enabled: !!gameSlug,
  });

export const useItem = (id: string, locale?: string) =>
  useQuery({
    queryKey: ["item", id, locale],
    queryFn: () => itemsApi.get(id, locale).then((r) => r.data.data),
    enabled: !!id,
  });

export const useItemSkills = (id: string) =>
  useQuery({
    queryKey: ["item-skills", id],
    queryFn: () => itemsApi.getSkills(id).then((r) => r.data.data),
    enabled: !!id,
  });

export const useItemBuilds = (id: string) =>
  useQuery({
    queryKey: ["item-builds", id],
    queryFn: () => itemsApi.getBuilds(id).then((r) => r.data.data),
    enabled: !!id,
  });

export const useItemChangelog = (id: string) =>
  useQuery({
    queryKey: ["item-changelog", id],
    queryFn: () => itemsApi.getChangelog(id).then((r) => r.data.data),
    enabled: !!id,
  });

export const useItemTranslations = (id: string) =>
  useQuery({
    queryKey: ["item-translations", id],
    queryFn: () => itemsApi.listTranslations(id).then((r) => r.data.data),
    enabled: !!id,
  });

// ── Collections ──────────────────────────────────────────────────────────────

export const useMyCollection = () =>
  useQuery({
    queryKey: ["my-collection"],
    queryFn: () => collectionsApi.getMyCollection().then((r) => r.data.data),
  });

export const useCollectionByGame = (gameId: string) =>
  useQuery({
    queryKey: ["collection-game", gameId],
    queryFn: () => collectionsApi.getByGame(gameId).then((r) => r.data.data),
    enabled: !!gameId,
  });

// ── Tier lists ───────────────────────────────────────────────────────────────

export const useMyTierlists = () =>
  useQuery({
    queryKey: ["my-tierlists"],
    queryFn: () => tierlistsApi.list().then((r) => r.data.data),
  });

export const usePublicTierlistsForGame = (gameId: string) =>
  useQuery({
    queryKey: ["public-tierlists", gameId],
    queryFn: () => tierlistsApi.listPublicForGame(gameId).then((r) => r.data.data),
    enabled: !!gameId,
  });

export const useTierlist = (id: string) =>
  useQuery({
    queryKey: ["tierlist", id],
    queryFn: () => tierlistsApi.get(id).then((r) => r.data.data),
    enabled: !!id,
  });

export const useTierlistBySlug = (slug: string) =>
  useQuery({
    queryKey: ["tierlist-share", slug],
    queryFn: () => tierlistsApi.getByShareSlug(slug).then((r) => r.data.data),
    enabled: !!slug,
  });

export const useTierlistComments = (id: string) =>
  useQuery({
    queryKey: ["tierlist-comments", id],
    queryFn: () => tierlistsApi.listComments(id).then((r) => r.data.data),
    enabled: !!id,
  });

// ── Search ───────────────────────────────────────────────────────────────────

export const useSearch = (
  q: string,
  params?: { game?: string; section?: string; page?: number; sort?: string }
) =>
  useQuery({
    queryKey: ["search", q, params],
    queryFn: () => searchApi.search(q, params).then((r) => r.data.data),
    enabled: q.length > 0,
  });

// ── Events / Calendar ──────────────────────────────────────────────────────────

export const useEvents = (params?: Omit<EventsQueryParams, "locale">, locale?: string) =>
  useQuery({
    queryKey: ["events", params, locale],
    queryFn: () => eventsApi.list({ ...params, ...(locale ? { locale } : {}) }).then((r) => r.data.data),
  });

// Every run of one banner, newest first. Used on a banner's own page.
export const useBannerRuns = (bannerItemId: string, locale?: string) =>
  useQuery({
    queryKey: ["bannerRuns", bannerItemId, locale],
    queryFn: () =>
      eventsApi
        .bannerRuns(bannerItemId, locale ? { locale } : undefined)
        .then((r) => r.data.data),
    enabled: !!bannerItemId,
  });

// Every run of every banner featuring this item — a character's pull history.
export const useItemBannerHistory = (itemId: string, locale?: string) =>
  useQuery({
    queryKey: ["itemBannerHistory", itemId, locale],
    queryFn: () =>
      eventsApi
        .itemBannerHistory(itemId, locale ? { locale } : undefined)
        .then((r) => r.data.data),
    enabled: !!itemId,
  });

export const useEvent = (id: string, locale?: string) =>
  useQuery({
    queryKey: ["event", id, locale],
    queryFn: () => eventsApi.get(id, locale).then((r) => r.data.data),
    enabled: !!id,
  });

export const useMyCalendar = (
  params?: Omit<EventsQueryParams, "game" | "game_id" | "locale">,
  locale?: string,
  enabled = true,
) =>
  useQuery({
    queryKey: ["my-calendar", params, locale],
    queryFn: () =>
      eventsApi.myCalendar({ ...params, ...(locale ? { locale } : {}) }).then((r) => r.data.data),
    enabled,
  });

export const useEventFollows = (enabled = true) =>
  useQuery({
    queryKey: ["event-follows"],
    queryFn: () => eventsApi.listFollows().then((r) => r.data.data),
    enabled,
  });

export const useGameServers = (gameId: string) =>
  useQuery({
    queryKey: ["game-servers", gameId],
    queryFn: () => eventsApi.getServers(gameId).then((r) => r.data.data),
    enabled: !!gameId,
  });

export const useUpsertFollow = () => {
  const qc = useQueryClient();
  return useMutation({
    // event_types AND server are both replaced on every upsert, so callers pass
    // the full intended state (preserving whichever they're not changing).
    mutationFn: ({
      gameId,
      eventTypes,
      server,
    }: {
      gameId: string;
      eventTypes: string[] | null;
      server: string | null;
    }) => eventsApi.upsertFollow(gameId, { event_types: eventTypes, server }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["event-follows"] });
      qc.invalidateQueries({ queryKey: ["my-calendar"] });
    },
  });
};

export const useDeleteFollow = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (gameId: string) => eventsApi.deleteFollow(gameId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["event-follows"] });
      qc.invalidateQueries({ queryKey: ["my-calendar"] });
    },
  });
};

// ── Checklists ───────────────────────────────────────────────────────────────

export const useChecklist = (gameId: string, enabled = true) =>
  useQuery({
    queryKey: ["checklist", gameId],
    queryFn: () => checklistApi.get(gameId).then((r) => r.data.data),
    enabled: enabled && !!gameId,
  });

interface ToggleArgs {
  source: string;
  task_id: string;
  done: boolean;
}

// Optimistic toggle so the checkbox flips instantly; the settled invalidation
// reconciles with the server-computed period.
export const useToggleChecklistTask = (gameId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: ToggleArgs) => checklistApi.toggle(data),
    onMutate: async (data: ToggleArgs) => {
      await qc.cancelQueries({ queryKey: ["checklist", gameId] });
      const prev = qc.getQueryData(["checklist", gameId]);
      qc.setQueryData(["checklist", gameId], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          tasks: old.tasks.map((t: any) =>
            t.id === data.task_id && t.source === data.source ? { ...t, done: data.done } : t,
          ),
        };
      });
      return { prev };
    },
    onError: (_e, _d, ctx: any) => {
      if (ctx?.prev) qc.setQueryData(["checklist", gameId], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["checklist", gameId] }),
  });
};

export const useCreateCustomTask = (gameId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: object) => checklistApi.createCustom(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["checklist", gameId] }),
  });
};

export const useUpdateCustomTask = (gameId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: object }) =>
      checklistApi.updateCustom(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["checklist", gameId] }),
  });
};

export const useDeleteCustomTask = (gameId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => checklistApi.deleteCustom(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["checklist", gameId] }),
  });
};

export const useSetHiddenTemplates = (gameId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (templateIds: string[]) => checklistApi.setHidden(gameId, templateIds),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["checklist", gameId] }),
  });
};

// ── Media ────────────────────────────────────────────────────────────────────

export const useMedia = () =>
  useQuery({
    queryKey: ["media"],
    queryFn: () => mediaApi.list().then((r) => r.data.data),
  });

// ── Users ────────────────────────────────────────────────────────────────────

export const useUsers = () =>
  useQuery({
    queryKey: ["users"],
    queryFn: () => usersApi.list().then((r) => r.data.data),
  });

export const usePublicProfile = (username: string) =>
  useQuery({
    queryKey: ["public-profile", username],
    queryFn: () => usersApi.getPublicProfile(username).then((r) => r.data.data),
    enabled: !!username,
  });

export const useAdminStats = () =>
  useQuery({
    queryKey: ["admin-stats"],
    queryFn: () => usersApi.getAdminStats().then((r) => r.data.data),
  });

export const useCurrentUser = () =>
  useQuery({
    queryKey: ["me"],
    queryFn: () => authApi.me().then((r) => r.data.data),
  });

// ── Admin mutations ───────────────────────────────────────────────────────────

export const useDeleteGame = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (slug: string) => adminApi.games.delete(slug),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["games"] }),
  });
};

export const useDeleteItem = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => adminApi.items.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["game-items"] }),
  });
};

export const useDeleteMedia = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => mediaApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["media"] }),
  });
};

export const useDeleteTierlist = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => tierlistsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-tierlists"] }),
  });
};

export const useUpsertCollectionEntry = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, data }: { itemId: string; data: object }) =>
      collectionsApi.upsertEntry(itemId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-collection"] });
      qc.invalidateQueries({ queryKey: ["collection-game"] });
    },
  });
};

export const useDeleteCollectionEntry = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) => collectionsApi.deleteEntry(itemId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-collection"] });
      qc.invalidateQueries({ queryKey: ["collection-game"] });
    },
  });
};
