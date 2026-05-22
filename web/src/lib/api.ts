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
    } catch {
      refreshQueue = [];
      return Promise.reject(error);
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
  get: (id: string, locale?: string) =>
    api.get(`/items/${id}`, { params: locale ? { locale } : {} }),
  getSkills: (id: string) => api.get(`/items/${id}/skills`),
  getBuilds: (id: string) => api.get(`/items/${id}/builds`),
  getChangelog: (id: string) => api.get(`/items/${id}/changelog`),
  listTranslations: (id: string) => api.get(`/items/${id}/translations`),
  upsertTranslation: (id: string, locale: string, fields: Record<string, string>) =>
    api.put(`/items/${id}/translations/${locale}`, { fields }),
  deleteTranslation: (id: string, locale: string) =>
    api.delete(`/items/${id}/translations/${locale}`),
};

export const collectionsApi = {
  getMyCollection: () => api.get("/collections"),
  getByGame: (gameId: string) => api.get(`/collections/${gameId}`),
  getUserCollection: (userId: string) => api.get(`/users/${userId}/collections`),
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
};
