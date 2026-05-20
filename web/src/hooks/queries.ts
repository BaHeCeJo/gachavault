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

export const useUserCollection = (userId: string) =>
  useQuery({
    queryKey: ["user-collection", userId],
    queryFn: () => collectionsApi.getUserCollection(userId).then((r) => r.data.data),
    enabled: !!userId,
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
