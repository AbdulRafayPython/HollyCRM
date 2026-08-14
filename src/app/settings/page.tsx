"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import SettingsNav from "@/components/settings/SettingsNav";
import Avatar from "@/components/ui/Avatar";
import Icon from "@/components/ui/Icon";
import { type AppRole } from "@/lib/types";

interface Profile {
  id: string;
  email: string | null;
  pending_email: string | null;
  full_name: string | null;
  role: AppRole | null;
  avatar_url: string | null;
  workspace: string | null;
  member_since: string | null;
  has_password: boolean;
}

export default function ProfileSettingsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("+92 313 0005968");
  const [language, setLanguage] = useState("English");
  const [note, setNote] = useState("");
  const [menuStyle, setMenuStyle] = useState("New left menu (Recommended)");
  const [twoFactor, setTwoFactor] = useState(false);

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: "ok" | "bad" } | null>(null);
  const [copiedId, setCopiedId] = useState(false);

  // Password Modal
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);

  // Photo upload
  const [photoBusy, setPhotoBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/profile", { cache: "no-store" });
    if (res.ok) {
      const json: Profile = await res.json();
      setProfile(json);
      setName(json.full_name ?? "");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSave(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setSaving(true);
    setMessage(null);

    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ full_name: name }),
    }).catch(() => null);

    setSaving(false);
    if (!res?.ok) {
      setMessage({ text: "Could not save settings.", tone: "bad" });
      return;
    }

    setMessage({ text: "Profile settings saved successfully.", tone: "ok" });
    await load();
    router.refresh();
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setPhotoBusy(true);
    setMessage(null);

    const form = new FormData();
    form.set("file", file);

    const res = await fetch("/api/profile/avatar", {
      method: "POST",
      body: form,
    }).catch(() => null);

    setPhotoBusy(false);
    if (!res?.ok) {
      setMessage({ text: "Could not upload avatar image.", tone: "bad" });
      return;
    }

    setMessage({ text: "Avatar updated.", tone: "ok" });
    await load();
    router.refresh();
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (newPw !== confirmPw) {
      setPwError("New passwords do not match.");
      return;
    }
    if (newPw.length < 6) {
      setPwError("Password must be at least 6 characters.");
      return;
    }

    setPwBusy(true);
    setPwError(null);

    const res = await fetch("/api/profile/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ current_password: currentPw, new_password: newPw }),
    }).catch(() => null);

    const json = await res?.json().catch(() => ({}));
    setPwBusy(false);

    if (!res?.ok) {
      setPwError(json?.error ?? "Could not update password.");
      return;
    }

    setShowPasswordModal(false);
    setCurrentPw("");
    setNewPw("");
    setConfirmPw("");
    setMessage({ text: "Password updated successfully.", tone: "ok" });
  }

  const userIdShort = profile?.id ? profile.id.slice(0, 8).replace(/-/g, "") : "15675471";

  const copyUserId = () => {
    if (profile?.id) {
      navigator.clipboard.writeText(profile.id);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    }
  };

  return (
    <div className="flex h-full bg-[#F8FAFC]">
      {/* Kommo-style Settings Nav Sidebar */}
      <SettingsNav />

      {/* Main Settings Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-white">
        {/* Top Sticky Header with Save Button */}
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200/80 px-8">
          <h1 className="text-xl font-bold text-slate-900">Profile settings</h1>
          <button
            type="button"
            onClick={() => handleSave()}
            disabled={saving}
            className="btn-primary rounded-xl px-5 py-2 text-xs font-semibold shadow-xs disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </header>

        {/* Form Body Scroll Area */}
        <div className="scroll-thin flex-1 overflow-y-auto p-8">
          <div className="max-w-2xl space-y-8">
            {message && (
              <div
                className={`flex items-center gap-2 rounded-xl p-3 text-xs font-medium ${
                  message.tone === "ok"
                    ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                    : "bg-rose-50 text-rose-800 border border-rose-200"
                }`}
              >
                <Icon name={message.tone === "ok" ? "check" : "alert"} size={16} />
                <span>{message.text}</span>
              </div>
            )}

            {/* Profile Avatar & Identity Row */}
            <div className="flex flex-col sm:flex-row items-start gap-8">
              {/* Avatar Circle with Camera Upload Icon */}
              <div className="relative group shrink-0">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handlePhotoUpload}
                  className="hidden"
                />
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="relative flex h-28 w-28 cursor-pointer items-center justify-center rounded-full bg-slate-700 text-white shadow-md overflow-hidden transition-transform hover:scale-105"
                >
                  {profile?.avatar_url ? (
                    <img
                      src={profile.avatar_url}
                      alt={name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-4xl font-bold uppercase">
                      {name ? name.charAt(0) : "A"}
                    </span>
                  )}

                  {/* Camera Icon Overlay */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 text-white opacity-0 transition-opacity group-hover:opacity-100">
                    <Icon name="image" size={24} />
                    <span className="mt-1 text-[10px] font-medium">Change</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute bottom-1 right-1 flex h-8 w-8 items-center justify-center rounded-full bg-white text-slate-700 shadow-md ring-1 ring-slate-200 hover:bg-slate-50 transition"
                  title="Upload photo"
                >
                  <Icon name="image" size={15} />
                </button>
              </div>

              {/* Identity & Metadata */}
              <div className="flex-1 space-y-3 w-full">
                {/* User ID */}
                <div className="flex items-center gap-6">
                  <span className="text-xs font-semibold text-slate-400 w-24">User ID</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-semibold text-slate-800">{userIdShort}</span>
                    <button
                      type="button"
                      onClick={copyUserId}
                      className="text-slate-400 hover:text-slate-700 transition"
                      title="Copy full ID"
                    >
                      <Icon name="paperclip" size={13} />
                    </button>
                    {copiedId && <span className="text-[10px] text-emerald-600 font-medium">Copied</span>}
                  </div>
                </div>

                {/* Login via */}
                <div className="flex items-center gap-6">
                  <span className="text-xs font-semibold text-slate-400 w-24">Login via</span>
                  <div className="flex items-center gap-2">
                    <Avatar name={name || "User"} size={22} />
                    <span className="text-xs font-semibold text-slate-800">{name || "User Account"}</span>
                    <form action="/auth/signout" method="post" className="inline-block ml-2">
                      <button
                        type="submit"
                        className="inline-flex items-center gap-1 text-xs font-medium text-rose-600 hover:underline"
                      >
                        <Icon name="logout" size={13} />
                        <span>Log out</span>
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            </div>

            {/* Form Fields Grid matching screenshot */}
            <form onSubmit={handleSave} className="space-y-4 pt-2">
              {/* Language */}
              <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-3">
                <label className="text-xs font-semibold text-slate-600">Language</label>
                <div className="sm:col-span-3">
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2 text-xs text-slate-800 focus:border-purple-500 focus:bg-white focus:outline-none transition"
                  >
                    <option>English</option>
                    <option>Arabic (العربية)</option>
                    <option>Urdu (اردو)</option>
                    <option>French (Français)</option>
                  </select>
                </div>
              </div>

              {/* Name */}
              <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-3">
                <label className="text-xs font-semibold text-slate-600">Name</label>
                <div className="sm:col-span-3">
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Full name"
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs text-slate-800 focus:border-purple-500 focus:outline-none transition"
                  />
                </div>
              </div>

              {/* Phone */}
              <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-3">
                <label className="text-xs font-semibold text-slate-600">Phone</label>
                <div className="sm:col-span-3">
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+92 300 1234567"
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs text-slate-800 focus:border-purple-500 focus:outline-none transition"
                  />
                </div>
              </div>

              {/* Email with Lock Icon */}
              <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-3">
                <label className="text-xs font-semibold text-slate-600">Email</label>
                <div className="sm:col-span-3 relative">
                  <input
                    type="email"
                    value={profile?.email || ""}
                    disabled
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 pr-9 text-xs text-slate-500 cursor-not-allowed"
                  />
                  <span className="absolute right-3 top-2.5 text-slate-400">
                    <Icon name="lock" size={14} />
                  </span>
                </div>
              </div>

              {/* Password */}
              <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-3">
                <label className="text-xs font-semibold text-slate-600">Password</label>
                <div className="sm:col-span-3 flex items-center gap-3">
                  <input
                    type="password"
                    value="••••••••••••"
                    disabled
                    className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs text-slate-400 cursor-not-allowed"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasswordModal(true)}
                    className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-purple-700 hover:bg-purple-50 transition shrink-0"
                  >
                    Change password
                  </button>
                </div>
              </div>

              {/* Note / Bio */}
              <div className="grid grid-cols-1 sm:grid-cols-4 items-start gap-3">
                <label className="text-xs font-semibold text-slate-600 pt-2">Note</label>
                <div className="sm:col-span-3">
                  <textarea
                    rows={3}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Add personal notes or agency responsibilities…"
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs text-slate-800 focus:border-purple-500 focus:outline-none transition resize-y"
                  />
                </div>
              </div>

              {/* Left Menu Style */}
              <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-3">
                <label className="text-xs font-semibold text-slate-600">Left menu</label>
                <div className="sm:col-span-3">
                  <select
                    value={menuStyle}
                    onChange={(e) => setMenuStyle(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2 text-xs text-slate-800 focus:border-purple-500 focus:bg-white focus:outline-none transition"
                  >
                    <option>New left menu (Recommended)</option>
                    <option>Compact icon rail</option>
                  </select>
                </div>
              </div>
            </form>

            {/* Security Section matching screenshot */}
            <div className="border-t border-slate-200/80 pt-6 space-y-4">
              <h2 className="text-sm font-bold text-slate-900">Security</h2>

              <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50/50 p-4">
                <div>
                  <p className="text-xs font-bold text-slate-800">2-step verification</p>
                  <p className="text-[11px] text-slate-400">
                    Add an extra layer of security to your HollyCRM agent account.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setTwoFactor((v) => !v)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    twoFactor ? "bg-purple-600" : "bg-slate-300"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                      twoFactor ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Change Password Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 animate-fade-in">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">Change Password</h3>
              <button
                onClick={() => setShowPasswordModal(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <Icon name="close" size={16} />
              </button>
            </div>

            {pwError && (
              <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                {pwError}
              </p>
            )}

            <form onSubmit={handlePasswordSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700">Current password</label>
                <input
                  type="password"
                  required
                  value={currentPw}
                  onChange={(e) => setCurrentPw(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs focus:border-purple-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">New password</label>
                <input
                  type="password"
                  required
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs focus:border-purple-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">Confirm new password</label>
                <input
                  type="password"
                  required
                  value={confirmPw}
                  onChange={(e) => setConfirmPw(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3.5 py-2 text-xs focus:border-purple-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowPasswordModal(false)}
                  className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pwBusy}
                  className="btn-primary rounded-xl px-4 py-2 text-xs font-semibold disabled:opacity-50"
                >
                  {pwBusy ? "Updating…" : "Update Password"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
