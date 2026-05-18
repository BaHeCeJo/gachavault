import axios from "axios";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

export const api = axios.create({
  baseURL: `${API_URL}/api/v1`,
  headers: { "Content-Type": "application/json" },
});

// Attach JWT token from localStorage if present
api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("access_token");
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Auth endpoints
export const authApi = {
  register: (data: { email: string; username: string; password: string }) =>
    api.post("/auth/register", data),
  login: (data: { email: string; password: string }) =>
    api.post("/auth/login", data),
  refresh: (refreshToken: string) =>
    api.post("/auth/refresh", { refresh_token: refreshToken }),
  logout: () => api.post("/auth/logout"),
  me: () => api.get("/auth/me"),
  verifyEmail: (token: string) => api.post("/auth/verify-email", { token }),
  forgotPassword: (email: string) => api.post("/auth/forgot-password", { email }),
  resetPassword: (token: string, password: string) =>
    api.post("/auth/reset-password", { token, password }),
};

// Games endpoints
export const gamesApi = {
  list: () => api.get("/games"),
  get: (slug: string) => api.get(`/games/${slug}`),
  getSections: (slug: string) => api.get(`/games/${slug}/sections`),
};

// Items endpoints
export const itemsApi = {
  listByGame: (gameSlug: string, params?: { page?: number; per_page?: number }) =>
    api.get(`/games/${gameSlug}/items`, { params }),
  get: (id: string) => api.get(`/items/${id}`),
  getSkills: (id: string) => api.get(`/items/${id}/skills`),
  getBuilds: (id: string) => api.get(`/items/${id}/builds`),
  getChangelog: (id: string) => api.get(`/items/${id}/changelog`),
};

// Collections endpoints
export const collectionsApi = {
  getMyCollection: () => api.get("/collections"),
  getByGame: (gameId: string) => api.get(`/collections/${gameId}`),
  upsertEntry: (itemId: string, data: object) => api.post(`/collections/items/${itemId}`, data),
  deleteEntry: (itemId: string) => api.delete(`/collections/items/${itemId}`),
};

// Tier lists endpoints
export const tierlistsApi = {
  list: () => api.get("/tierlists"),
  get: (id: string) => api.get(`/tierlists/${id}`),
  getByShareSlug: (slug: string) => api.get(`/tierlists/share/${slug}`),
  create: (data: object) => api.post("/tierlists", data),
  update: (id: string, data: object) => api.put(`/tierlists/${id}`, data),
  delete: (id: string) => api.delete(`/tierlists/${id}`),
  upsertEntries: (id: string, entries: object[]) =>
    api.post(`/tierlists/${id}/entries`, { entries }),
};

// Search endpoint
export const searchApi = {
  search: (q: string, params?: { game?: string; section?: string; page?: number }) =>
    api.get("/search", { params: { q, ...params } }),
};
