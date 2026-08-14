"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { api, authApi, collectionsApi, mediaApi } from "@/lib/api";
import { Avatar } from "@/components/Avatar";

export default function ProfilePage() {
  const { user, isLoading, logout, refreshUser } = useAuth();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [uploading, setUploading] = useState(false);
  const [avatarError, setAvatarError] = useState("");

  const [username, setUsername] = useState("");
  const [usernameLoading, setUsernameLoading] = useState(false);
  const [usernameMsg, setUsernameMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwLoading, setPwLoading] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [showDelete, setShowDelete] = useState(false);

  const [collectionPublic, setCollectionPublic] = useState(false);
  const [visibilityMsg, setVisibilityMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!isLoading && !user) router.replace("/auth/login?redirect=/profile");
  }, [isLoading, user, router]);

  useEffect(() => {
    if (user) setUsername(user.username);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    collectionsApi
      .getVisibility()
      .then((r) => setCollectionPublic(!!r.data.data?.collection_public))
      .catch(() => {});
  }, [user]);

  const handleVisibility = async (next: boolean) => {
    // Optimistic: the toggle is cheap to reverse and a lagging switch reads as
    // broken. Roll back if the write fails.
    setCollectionPublic(next);
    setVisibilityMsg(null);
    try {
      await collectionsApi.setVisibility(next);
      setVisibilityMsg({
        ok: true,
        text: next ? "Your collection totals are now public." : "Your collection is private again.",
      });
    } catch {
      setCollectionPublic(!next);
      setVisibilityMsg({ ok: false, text: "Couldn't save that — please try again." });
    }
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setAvatarError("File too large — max 5 MB"); return; }
    setAvatarError("");
    setUploading(true);
    try {
      const uploadRes = await mediaApi.uploadAvatar(file);
      const url: string = uploadRes.data.data?.public_url;
      await api.patch("/auth/me", { avatar_url: url });
      await refreshUser?.();
    } catch {
      setAvatarError("Upload failed — please try again");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleUsernameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || username === user?.username) return;
    setUsernameLoading(true);
    setUsernameMsg(null);
    try {
      await authApi.updateUsername(username.trim());
      await refreshUser?.();
      setUsernameMsg({ ok: true, text: "Username updated." });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Failed to update username.";
      setUsernameMsg({ ok: false, text: msg });
    } finally {
      setUsernameLoading(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPw !== confirmPw) { setPwMsg({ ok: false, text: "Passwords don't match." }); return; }
    if (newPw.length < 8) { setPwMsg({ ok: false, text: "New password must be at least 8 characters." }); return; }
    setPwLoading(true);
    setPwMsg(null);
    try {
      await authApi.changePassword(currentPw, newPw);
      setCurrentPw(""); setNewPw(""); setConfirmPw("");
      setPwMsg({ ok: true, text: "Password changed. All other sessions have been signed out." });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Failed to change password.";
      setPwMsg({ ok: false, text: msg });
    } finally {
      setPwLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    setDeleteLoading(true);
    setDeleteError("");
    try {
      const pw = user?.provider === "local" ? deleteConfirm : undefined;
      await authApi.deleteAccount(pw);
      await logout();
      router.push("/");
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Failed to delete account.";
      setDeleteError(msg);
      setDeleteLoading(false);
    }
  };

  if (isLoading || !user) {
    return (
      <main className="flex min-h-[calc(100vh-57px)] items-center justify-center">
        <div className="text-gray-400 animate-pulse">Loading…</div>
      </main>
    );
  }

  return (
    <main className="max-w-2xl mx-auto px-6 py-10 space-y-8">
      <h1 className="text-3xl font-semibold">My Profile</h1>

      {/* ── Avatar + info ───────────────────────────────────────────── */}
      <section className="rounded-xl border border-gray-800 bg-gray-900 p-6 space-y-4">
        <div className="flex items-center gap-4">
          <div className="relative group">
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="block w-16 h-16 rounded-full overflow-hidden focus:outline-none focus:ring-2 focus:ring-white"
              aria-label="Change avatar"
            >
              <Avatar username={user.username} avatarUrl={user.avatar_url} size={64} className="w-full h-full" />
              <div className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition text-xs">
                {uploading ? "…" : "Change"}
              </div>
            </button>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleAvatarChange} />
          </div>
          <div>
            <p className="text-xl font-semibold">{user.username}</p>
            <p className="text-gray-400 text-sm">{user.email}</p>
            {avatarError && <p className="text-red-400 text-xs mt-1">{avatarError}</p>}
          </div>
        </div>

        <div className="border-t border-gray-800 pt-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">Email verified</span>
            <span className={user.email_verified ? "text-green-400" : "text-yellow-400"}>
              {user.email_verified ? "Yes" : "Not verified"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Sign-in method</span>
            <span className="capitalize">{user.provider}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Member since</span>
            <span>{new Date(user.created_at).toLocaleDateString()}</span>
          </div>
        </div>
      </section>

      {/* ── Change username ─────────────────────────────────────────── */}
      <section className="rounded-xl border border-gray-800 bg-gray-900 p-6">
        <h2 className="text-lg font-semibold mb-4">Change Username</h2>
        <form onSubmit={handleUsernameSubmit} className="flex gap-3">
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            minLength={3}
            maxLength={50}
            className="flex-1 rounded-lg bg-gray-800 border border-gray-700 px-4 py-2 text-sm focus:outline-none focus:border-gray-500"
          />
          <button
            type="submit"
            disabled={usernameLoading || !username.trim() || username === user.username}
            className="px-4 py-2 rounded-lg bg-white text-black text-sm hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {usernameLoading ? "Saving…" : "Save"}
          </button>
        </form>
        {usernameMsg && (
          <p className={`mt-2 text-sm ${usernameMsg.ok ? "text-green-400" : "text-red-400"}`}>
            {usernameMsg.text}
          </p>
        )}
      </section>

      {/* ── Change password ─────────────────────────────────────────── */}
      {user.provider === "local" && (
        <section className="rounded-xl border border-gray-800 bg-gray-900 p-6">
          <h2 className="text-lg font-semibold mb-4">Change Password</h2>
          <form onSubmit={handlePasswordSubmit} className="space-y-3">
            <input
              type="password"
              placeholder="Current password"
              value={currentPw}
              onChange={(e) => setCurrentPw(e.target.value)}
              required
              className="w-full rounded-lg bg-gray-800 border border-gray-700 px-4 py-2 text-sm focus:outline-none focus:border-gray-500"
            />
            <input
              type="password"
              placeholder="New password (min 8 chars)"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              required
              minLength={8}
              className="w-full rounded-lg bg-gray-800 border border-gray-700 px-4 py-2 text-sm focus:outline-none focus:border-gray-500"
            />
            <input
              type="password"
              placeholder="Confirm new password"
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              required
              className="w-full rounded-lg bg-gray-800 border border-gray-700 px-4 py-2 text-sm focus:outline-none focus:border-gray-500"
            />
            <button
              type="submit"
              disabled={pwLoading}
              className="w-full py-2 rounded-lg bg-white text-black text-sm hover:bg-gray-200 disabled:opacity-50 transition"
            >
              {pwLoading ? "Updating…" : "Update Password"}
            </button>
          </form>
          {pwMsg && (
            <p className={`mt-2 text-sm ${pwMsg.ok ? "text-green-400" : "text-red-400"}`}>
              {pwMsg.text}
            </p>
          )}
        </section>
      )}

      {/* ── Privacy ─────────────────────────────────────────────────── */}
      <section className="rounded-xl border border-gray-800 bg-gray-900 p-6">
        <h2 className="text-lg font-semibold mb-1">Public profile</h2>
        <p className="text-sm text-gray-400 mb-4">
          Your collection is private. Turn this on to show how many items you own, per game, on{" "}
          <a
            href={`/users/${user.username}`}
            className="text-amber-300 hover:underline"
          >
            your public profile
          </a>
          . Only the totals are shared — never which items you own, or their levels.
        </p>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={collectionPublic}
            onChange={(e) => handleVisibility(e.target.checked)}
            className="h-4 w-4 accent-amber-500"
          />
          <span className="text-sm text-gray-200">Show my collection totals publicly</span>
        </label>
        {visibilityMsg && (
          <p className={`mt-2 text-sm ${visibilityMsg.ok ? "text-green-400" : "text-red-400"}`}>
            {visibilityMsg.text}
          </p>
        )}
      </section>

      {/* ── Quick links ─────────────────────────────────────────────── */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Quick links</h2>
        <div className="grid grid-cols-2 gap-3">
          {[
            { href: "/collections", label: "My Collection" },
            { href: "/tierlists", label: "My Tier Lists" },
          ].map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="px-4 py-3 rounded-lg border border-gray-800 hover:border-gray-600 transition text-sm"
            >
              {link.label}
            </a>
          ))}
        </div>
      </section>

      {/* ── Sign out + delete ────────────────────────────────────────── */}
      <section className="space-y-4">
        <button
          onClick={async () => { await logout(); router.push("/"); }}
          className="text-sm text-red-400 hover:text-red-300 transition"
        >
          Sign out
        </button>

        <div className="border-t border-gray-800 pt-4">
          {!showDelete ? (
            <button
              onClick={() => setShowDelete(true)}
              className="text-sm text-gray-500 hover:text-red-400 transition"
            >
              Delete account…
            </button>
          ) : (
            <div className="rounded-xl border border-red-900 bg-red-950/30 p-5 space-y-4">
              <p className="text-sm font-semibold text-red-400">Delete account</p>
              <p className="text-xs text-gray-400">
                This is permanent. All your data — collections, tier lists, and profile — will be deleted.
              </p>
              {user.provider === "local" && (
                <input
                  type="password"
                  placeholder="Confirm your password"
                  value={deleteConfirm}
                  onChange={(e) => setDeleteConfirm(e.target.value)}
                  className="w-full rounded-lg bg-gray-800 border border-gray-700 px-4 py-2 text-sm focus:outline-none focus:border-red-700"
                />
              )}
              {deleteError && <p className="text-sm text-red-400">{deleteError}</p>}
              <div className="flex gap-3">
                <button
                  onClick={handleDeleteAccount}
                  disabled={deleteLoading || (user.provider === "local" && !deleteConfirm)}
                  className="flex-1 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm disabled:opacity-50 transition"
                >
                  {deleteLoading ? "Deleting…" : "Yes, delete my account"}
                </button>
                <button
                  onClick={() => { setShowDelete(false); setDeleteConfirm(""); setDeleteError(""); }}
                  className="flex-1 py-2 rounded-lg border border-gray-700 text-sm hover:border-gray-500 transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
