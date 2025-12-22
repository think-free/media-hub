// Use same hostname as the current page but with backend port 8080
const API = (import.meta as any).env.VITE_API_BASE ??
  (typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.hostname}:8080` : "http://localhost:8080");

export type LoginResponse = { token: string };

export async function apiFetch(path: string, init: RequestInit = {}) {
  const token = localStorage.getItem("mh_token");
  const headers = new Headers(init.headers || {});
  headers.set("Content-Type", headers.get("Content-Type") || "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(`${API}${path}`, { ...init, headers });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(t || `HTTP ${res.status}`);
  }
  return res;
}

export async function login(username: string, password: string): Promise<string> {
  const res = await apiFetch("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
    headers: { "Content-Type": "application/json" },
  });
  const data = (await res.json()) as LoginResponse;
  localStorage.setItem("mh_token", data.token);
  return data.token;
}

export function logout() {
  localStorage.removeItem("mh_token");
}

export async function getLibraries() {
  const res = await apiFetch("/api/libraries");
  return res.json() as Promise<Array<{ id: number; name: string; roots: string[] }>>;
}

export async function scanLibrary(libraryId: number) {
  await apiFetch(`/api/scan?library_id=${libraryId}`, { method: "POST" });
}

export async function createLibrary(name: string, roots: string[]) {
  const res = await apiFetch("/api/libraries", {
    method: "POST",
    body: JSON.stringify({ name, roots }),
  });
  return res.json() as Promise<{ id: number; name: string; roots: string[] }>;
}

export async function deleteLibrary(id: number) {
  await apiFetch(`/api/libraries/${id}`, { method: "DELETE" });
}

export type MediaItem = {
  id: number;
  library_id: number;
  rel_path: string;
  path: string;
  kind: "video" | "audio" | "photo" | "other";
  present: boolean;
  size_bytes: number;
  last_seen_at: string;
  thumb_url?: string;
};

export type PagedItems = { page: number; page_size: number; total: number; items: MediaItem[] };

export async function getItems(params: {
  libraryId: number;
  kind?: string;
  q?: string;
  page?: number;
  pageSize?: number;
  sort?: "recent" | "name";
}) {
  const qs = new URLSearchParams();
  qs.set("library_id", String(params.libraryId));
  if (params.kind) qs.set("kind", params.kind);
  if (params.q) qs.set("q", params.q);
  qs.set("page", String(params.page ?? 1));
  qs.set("pageSize", String(params.pageSize ?? 50));
  qs.set("sort", params.sort ?? "recent");
  const res = await apiFetch(`/api/items?${qs.toString()}`);
  return res.json() as Promise<PagedItems>;
}

export function streamUrl(itemId: number) { return `${API}/api/items/${itemId}/stream`; }
export function thumbUrl(itemId: number) { return `${API}/api/items/${itemId}/thumb`; }

export async function getFavorites() {
  const res = await apiFetch("/api/favorites");
  return res.json() as Promise<MediaItem[]>;
}
export async function setFavorite(itemId: number) {
  await apiFetch(`/api/favorites/${itemId}`, { method: "POST" });
}
export async function unsetFavorite(itemId: number) {
  await apiFetch(`/api/favorites/${itemId}`, { method: "DELETE" });
}

export type FoldersResponse = { folders: string[]; items: MediaItem[] };

export async function getFolders(libraryId: number, path: string = "") {
  const res = await apiFetch(`/api/folders?library_id=${libraryId}&path=${encodeURIComponent(path)}`);
  return res.json() as Promise<FoldersResponse>;
}

// Tags API
export type Tag = { id: number; name: string; count?: number };

export async function getTags() {
  const res = await apiFetch("/api/tags");
  return res.json() as Promise<Tag[]>;
}

export async function createTag(name: string) {
  const res = await apiFetch("/api/tags", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  return res.json() as Promise<{ id: number; name: string }>;
}

export async function deleteTag(id: number) {
  await apiFetch(`/api/tags/${id}`, { method: "DELETE" });
}

export async function getItemTags(itemId: number) {
  const res = await apiFetch(`/api/items/${itemId}/tags`);
  return res.json() as Promise<Tag[]>;
}

export async function addTagToItem(itemId: number, tagId: number) {
  await apiFetch(`/api/items/${itemId}/tags/${tagId}`, { method: "POST" });
}

export async function removeTagFromItem(itemId: number, tagId: number) {
  await apiFetch(`/api/items/${itemId}/tags/${tagId}`, { method: "DELETE" });
}

export async function getItemsByTag(tagId: number) {
  const res = await apiFetch(`/api/tags/${tagId}/items`);
  return res.json() as Promise<MediaItem[]>;
}

// User management
export type User = { id: number; username: string; created_at: string };

export async function getUsers() {
  const res = await apiFetch("/api/users");
  return res.json() as Promise<User[]>;
}

export async function createUser(username: string, password: string) {
  const res = await apiFetch("/api/users", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  return res.json() as Promise<{ id: number; username: string }>;
}

export async function deleteUser(id: number) {
  const res = await apiFetch(`/api/users/${id}`, { method: "DELETE" });
  return res.json() as Promise<{ ok: boolean; self_deleted: boolean }>;
}

export async function changePassword(oldPassword: string, newPassword: string) {
  await apiFetch("/api/users/password", {
    method: "PUT",
    body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
  });
}

export async function getCurrentUser() {
  const res = await apiFetch("/api/users/me");
  return res.json() as Promise<{ id: number; username: string }>;
}

// Home dashboard
export async function getRecentItems(limit = 20, libraryId?: number) {
  const params = new URLSearchParams();
  params.set('limit', String(limit));
  if (libraryId) params.set('library_id', String(libraryId));
  const res = await apiFetch(`/api/recent?${params.toString()}`);
  return res.json() as Promise<MediaItem[]>;
}

export async function getHistory(limit = 20, libraryId?: number) {
  const params = new URLSearchParams();
  params.set('limit', String(limit));
  if (libraryId) params.set('library_id', String(libraryId));
  const res = await apiFetch(`/api/history?${params.toString()}`);
  return res.json() as Promise<MediaItem[]>;
}

export async function recordView(itemId: number) {
  await apiFetch(`/api/history/${itemId}`, { method: "POST" });
}
