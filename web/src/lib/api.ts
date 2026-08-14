import axios, { AxiosError } from "axios";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

export const api = axios.create({
  baseURL: `${API_URL}/api/v1`,
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
});

// Transparent token refresh on 401 — cookies are managed by the browser/server,
// we just need to call /auth/refresh and retry the original request.
let refreshing = false;
let refreshQueue: Array<() => void> = [];

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as typeof error.config & { _retry?: boolean };

    if (
      error.response?.status !== 401 ||
      original?._retry ||
      original?.url?.includes("/auth/refresh")
    ) {
      return Promise.reject(error);
    }

    if (refreshing) {
      return new Promise<void>((resolve) => {
        refreshQueue.push(resolve);
      }).then(() => api(original!));
    }

    original._retry = true;
    refreshing = true;

    try {
      await api.post("/auth/refresh");
      refreshQueue.forEach((resolve) => resolve());
      refreshQueue = [];
      return api(original!);
    } catch (refreshError) {
      // The user's session is gone — neither the original 401 nor a fresh
      // login attempt will help. Drain the queue and reject with a typed
      // error so callers can show "please sign in again" instead of the
      // confusing generic 401 from the original request.
      refreshQueue = [];
      // A 401 from /auth/refresh is the *expected* anonymous / expired-session
      // path: every page load (incl. the public landing page) probes an authed
      // endpoint like /auth/me before we know who the visitor is, so for a
      // logged-out user this branch runs on every visit. Logging it as
      // console.error was noise — it dinged Lighthouse "Best Practices" and
      // alarmed anyone reading the console. Only surface a *genuinely*
      // unexpected refresh failure (network error, 5xx).
      const refreshStatus = (refreshError as AxiosError)?.response?.status;
      if (refreshStatus !== 401) {
        // 5xx, or a network error with no response at all — worth knowing about.
        console.warn("[api] token refresh failed unexpectedly", refreshError);
      }
      const sessionError = new Error("Session expired — please sign in again");
      (sessionError as Error & { code?: string }).code = "SESSION_EXPIRED";
      return Promise.reject(sessionError);
    } finally {
      refreshing = false;
    }
  }
);

export const authApi = {
  register: (data: { email: string; username: string; password: string }) =>
    api.post("/auth/register", data),
  login: (data: { email: string; password: string }) =>
    api.post("/auth/login", data),
  logout: () => api.post("/auth/logout"),
  me: () => api.get("/auth/me"),
  verifyEmail: (token: string) => api.post("/auth/verify-email", { token }),
  forgotPassword: (email: string) => api.post("/auth/forgot-password", { email }),
  resetPassword: (token: string, password: string) =>
    api.post("/auth/reset-password", { token, password }),
  updateUsername: (username: string) => api.patch("/auth/me/username", { username }),
  changePassword: (current_password: string, new_password: string) =>
    api.post("/auth/me/password", { current_password, new_password }),
  deleteAccount: (password?: string) => api.delete("/auth/me", { data: { password } }),
};

export const gamesApi = {
  list: (includeInactive = false, locale?: string) =>
    api.get("/games", { params: { include_inactive: includeInactive, ...(locale ? { locale } : {}) } }),
  get: (slug: string, locale?: string) =>
    api.get(`/games/${slug}`, { params: locale ? { locale } : {} }),
  getSections: (slug: string) => api.get(`/games/${slug}/sections`),
  getSection: (id: string) => api.get(`/sections/${id}`),
  listSchemas: (slug: string) => api.get(`/games/${slug}/schemas`),
  getAttributes: (slug: string, attrType?: string) =>
    api.get(`/games/${slug}/attributes`, { params: attrType ? { attr_type: attrType } : {} }),
  listTranslations: (slug: string) => api.get(`/games/${slug}/translations`),
  upsertTranslation: (slug: string, locale: string, data: { name: string; description?: string }) =>
    api.put(`/games/${slug}/translations/${locale}`, data),
  deleteTranslation: (slug: string, locale: string) =>
    api.delete(`/games/${slug}/translations/${locale}`),
};

export const itemsApi = {
  listByGame: (gameSlug: string, params?: { game_id?: string; section_id?: string; limit?: number; offset?: number }) =>
    api.get(`/games/${gameSlug}/items`, { params }),
  list: (params?: { game_id?: string; section_id?: string; limit?: number; offset?: number }) =>
    api.get("/items", { params }),
  // Fetches every item matching the filters by paginating through the
  // /items endpoint. The server caps a single response at 200 rows, so callers
  // that want the full set must page through. HARD_CAP guards against an
  // unbounded loop if the backend ever stops honouring offset.
  listAll: async <T = unknown>(params?: { game_id?: string; section_id?: string }): Promise<T[]> => {
    const PAGE = 200;
    const HARD_CAP = 100_000;
    const all: T[] = [];
    let offset = 0;
    while (all.length < HARD_CAP) {
      const res = await api.get("/items", { params: { ...params, limit: PAGE, offset } });
      const page: T[] = res.data?.data ?? [];
      all.push(...page);
      if (page.length < PAGE) break;
      offset += PAGE;
    }
    return all;
  },
  get: (id: string, locale?: string) =>
    api.get(`/items/${id}`, { params: locale ? { locale } : {} }),
  getBySlug: (gameSlug: string, sectionSlug: string, itemSlug: string, locale?: string) =>
    api.get(`/items/by-slug/${gameSlug}/${sectionSlug}/${itemSlug}`, { params: locale ? { locale } : {} }),
  getSkills: (id: string) => api.get(`/items/${id}/skills`),
  getBuilds: (id: string) => api.get(`/items/${id}/builds`),
  getChangelog: (id: string) => api.get(`/items/${id}/changelog`),
  // Item↔item relations. `links` are the items this one points at (a banner's
  // rate-up roster); `backlinks` are the ones pointing at it (every banner that
  // features this character).
  getLinks: (id: string, relation?: string) =>
    api.get(`/items/${id}/links`, { params: relation ? { relation } : {} }),
  getBacklinks: (id: string, relation?: string) =>
    api.get(`/items/${id}/backlinks`, { params: relation ? { relation } : {} }),
  setLinks: (
    id: string,
    links: { linked_item_id: string; relation?: string; order?: number }[],
    relation?: string,
  ) => api.put(`/items/${id}/links`, { links, ...(relation ? { relation } : {}) }),
  listTranslations: (id: string) => api.get(`/items/${id}/translations`),
  upsertTranslation: (id: string, locale: string, fields: Record<string, string>) =>
    api.put(`/items/${id}/translations/${locale}`, { fields }),
  deleteTranslation: (id: string, locale: string) =>
    api.delete(`/items/${id}/translations/${locale}`),
};

export const collectionsApi = {
  getMyCollection: () => api.get("/collections"),
  getByGame: (gameId: string) => api.get(`/collections/${gameId}`),
  // Whether this user's collection totals show on their public profile.
  getVisibility: () => api.get("/collections/visibility"),
  setVisibility: (collectionPublic: boolean) =>
    api.put("/collections/visibility", { collection_public: collectionPublic }),
  upsertEntry: (itemId: string, data: object) => api.post(`/collections/items/${itemId}`, data),
  deleteEntry: (itemId: string) => api.delete(`/collections/items/${itemId}`),
};

export const tierlistsApi = {
  list: () => api.get("/tierlists"),
  listPublicForGame: (gameId: string) => api.get(`/tierlists/public`, { params: { game_id: gameId } }),
  get: (id: string) => api.get(`/tierlists/${id}`),
  getByShareSlug: (slug: string) => api.get(`/tierlists/share/${slug}`),
  create: (data: object) => api.post("/tierlists", data),
  update: (id: string, data: object) => api.put(`/tierlists/${id}`, data),
  delete: (id: string) => api.delete(`/tierlists/${id}`),
  upsertEntries: (id: string, entries: object[]) =>
    api.post(`/tierlists/${id}/entries`, entries),
  upvote: (id: string) => api.post(`/tierlists/${id}/upvote`),
  removeUpvote: (id: string) => api.delete(`/tierlists/${id}/upvote`),
  listComments: (id: string) => api.get(`/tierlists/${id}/comments`),
  createComment: (id: string, body: string) => api.post(`/tierlists/${id}/comments`, { body }),
  deleteComment: (tierId: string, commentId: string) => api.delete(`/tierlists/${tierId}/comments/${commentId}`),
};

export const searchApi = {
  search: (q: string, params?: { game?: string; section?: string; page?: number; sort?: string }) =>
    api.get("/search", { params: { q, ...params } }),
};

export interface EventsQueryParams {
  game?: string;
  game_id?: string;
  event_type?: string;
  status?: string;
  from?: string;
  to?: string;
  locale?: string;
  // Admin-only: include unpublished/draft events in the listing.
  include_unpublished?: boolean;
}

export const eventsApi = {
  list: (params?: EventsQueryParams) => api.get("/events", { params }),
  get: (id: string, locale?: string) =>
    api.get(`/events/${id}`, { params: locale ? { locale } : {} }),
  // Personalized calendar — events for the games the signed-in user follows.
  myCalendar: (params?: Omit<EventsQueryParams, "game" | "game_id">) =>
    api.get("/events/my-calendar", { params }),
  // Per-user game follows (the personalized-calendar drivers).
  listFollows: () => api.get("/events/follows"),
  upsertFollow: (
    gameId: string,
    data: { event_types?: string[] | null; server?: string | null },
  ) => api.put(`/events/follows/${gameId}`, data),
  deleteFollow: (gameId: string) => api.delete(`/events/follows/${gameId}`),
  // Per-game servers (regional accounts).
  getServers: (gameId: string) => api.get(`/events/servers/${gameId}`),
  setServers: (gameId: string, servers: object[]) =>
    api.put(`/events/servers/${gameId}`, { servers }),
  // Admin authoring.
  create: (data: object) => api.post("/events", data),
  // mode "update" overwrites events whose slug already exists instead of
  // skipping them, so a file exported, corrected and sent back through this
  // endpoint actually lands. Default stays "skip".
  bulkImport: (events: object[], mode?: "skip" | "update") =>
    api.post("/events/bulk-import", events, { params: mode ? { mode } : {} }),
  bulkExport: (params?: { game?: string; event_type?: string }) =>
    api.get("/events/bulk-export", { params }),
  update: (id: string, data: object) => api.put(`/events/${id}`, data),
  delete: (id: string) => api.delete(`/events/${id}`),
  setItems: (id: string, items: object[]) => api.put(`/events/${id}/items`, { items }),
  setServerTimes: (id: string, times: object[]) =>
    api.put(`/events/${id}/server-times`, { times }),
  // Every run of one banner, newest first.
  bannerRuns: (bannerItemId: string, params?: EventsQueryParams) =>
    api.get(`/events/banners/${bannerItemId}/runs`, { params }),
  // Every run of every banner featuring this item — a character's banner history.
  itemBannerHistory: (itemId: string, params?: EventsQueryParams) =>
    api.get(`/events/by-item/${itemId}/banner-history`, { params }),
  listTranslations: (id: string) => api.get(`/events/${id}/translations`),
  upsertTranslation: (id: string, locale: string, data: { title: string; description?: string }) =>
    api.put(`/events/${id}/translations/${locale}`, data),
  deleteTranslation: (id: string, locale: string) =>
    api.delete(`/events/${id}/translations/${locale}`),
};

export const checklistApi = {
  // A user's resolved checklist for a game (defaults minus hidden + custom tasks,
  // each with done/period_key/resets_at for the current period).
  get: (gameId: string) => api.get(`/checklists/${gameId}`),
  toggle: (data: { source: string; task_id: string; done: boolean }) =>
    api.post("/checklists/toggle", data),
  createCustom: (data: object) => api.post("/checklists/custom", data),
  updateCustom: (id: string, data: object) => api.put(`/checklists/custom/${id}`, data),
  deleteCustom: (id: string) => api.delete(`/checklists/custom/${id}`),
  // Replace the user's hidden-defaults set for one game.
  setHidden: (gameId: string, templateIds: string[]) =>
    api.put(`/checklists/${gameId}/hidden`, { template_ids: templateIds }),
  // Admin authoring of a game's default tasks.
  listTemplates: (gameId: string) => api.get(`/checklists/${gameId}/templates`),
  setTemplates: (gameId: string, templates: object[]) =>
    api.put(`/checklists/${gameId}/templates`, { templates }),
};

export const mediaApi = {
  list: () => api.get("/media"),
  get: (id: string) => api.get(`/media/${id}`),
  delete: (id: string) => api.delete(`/media/${id}`),
  upload: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return api.post("/media/upload", form, { headers: { "Content-Type": "multipart/form-data" } });
  },
  uploadAvatar: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return api.post("/media/avatar", form, { headers: { "Content-Type": "multipart/form-data" } });
  },
};

export const usersApi = {
  list: () => api.get("/users"),
  getPublicProfile: (username: string) => api.get(`/users/by-username/${username}`),
  getAdminStats: () => api.get("/admin/stats"),
};

export const adminApi = {
  games: {
    list: () => api.get("/games", { params: { include_inactive: true } }),
    create: (data: object) => api.post("/games", data),
    update: (slug: string, data: object) => api.put(`/games/${slug}`, data),
    delete: (slug: string) => api.delete(`/games/${slug}`),
    createSection: (slug: string, data: object) => api.post(`/games/${slug}/sections`, data),
    updateSection: (slug: string, id: string, data: object) => api.patch(`/games/${slug}/sections/${id}`, data),
    deleteSection: (slug: string, id: string) => api.delete(`/games/${slug}/sections/${id}`),
    listSchemas: (slug: string) => api.get(`/games/${slug}/schemas`),
    createSchema: (slug: string, data: object) => api.post(`/games/${slug}/schemas`, data),
    updateSchema: (slug: string, id: string, data: object) => api.patch(`/games/${slug}/schemas/${id}`, data),
    deleteSchema: (slug: string, id: string) => api.delete(`/games/${slug}/schemas/${id}`),
    listAttributes: (slug: string, attrType?: string) =>
      api.get(`/games/${slug}/attributes`, { params: attrType ? { attr_type: attrType } : {} }),
    createAttribute: (slug: string, data: object) => api.post(`/games/${slug}/attributes`, data),
    updateAttribute: (slug: string, id: string, data: object) => api.patch(`/games/${slug}/attributes/${id}`, data),
    deleteAttribute: (slug: string, id: string) => api.delete(`/games/${slug}/attributes/${id}`),
  },
  items: {
    create: (data: object) => api.post("/items", data),
    bulkImport: (items: object[]) => api.post("/items/bulk-import", items),
    update: (id: string, data: object) => api.put(`/items/${id}`, data),
    delete: (id: string) => api.delete(`/items/${id}`),
    createSkill: (id: string, data: object) => api.post(`/items/${id}/skills`, data),
    createBuild: (id: string, data: object) => api.post(`/items/${id}/builds`, data),
    createChangelog: (id: string, data: object) => api.post(`/items/${id}/changelog`, data),
  },
  users: {
    setRole: (userId: string, role: string) =>
      api.patch(`/users/${userId}/role`, { role }),
    listGameRoles: (userId: string) =>
      api.get(`/users/${userId}/game-roles`),
    setGameRole: (userId: string, gameId: string, role: string, sectionId?: string) =>
      api.post(`/users/${userId}/game-roles`, { game_id: gameId, section_id: sectionId ?? null, role }),
    removeGameRole: (userId: string, gameId: string) =>
      api.delete(`/users/${userId}/game-roles/${gameId}`),
  },
  // Read-only observability proxied through auth-service to Loki (admin-gated).
  monitoring: {
    logs: (params?: { service?: string; level?: string; search?: string; limit?: number }) =>
      api.get("/admin/logs", { params }),
    alerts: () => api.get("/admin/alerts"),
    logStats: () => api.get("/admin/log-stats"),
    // Server resources via Prometheus (host + per-container CPU/RAM/disk).
    metrics: () => api.get("/admin/metrics"),
    metricsRange: () => api.get("/admin/metrics-range"),
  },
};
