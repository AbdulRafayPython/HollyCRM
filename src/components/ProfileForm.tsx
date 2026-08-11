"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import Avatar from "./ui/Avatar";
import Chip from "./ui/Chip";
import Icon from "./ui/Icon";
import { ROLE_LABELS, type AppRole } from "@/lib/types";

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

type Note = { tone: "ok" | "bad"; text: string } | null;

/**
 * The signed-in person's own account.
 *
 * Split by where each field actually lives, because that decides how it is
 * written and what can go wrong:
 *   name + photo  -> public.profiles, saved through our API under RLS
 *   email         -> auth.users, changed via the browser's own session, and
 *                    only takes effect after a confirmation link
 *   password      -> auth.users, and only after re-entering the current one
 *
 * Each section saves independently. A single "Save changes" button spanning all
 * three would have to explain a half-success — name saved, email pending
 * confirmation, password rejected — in one message.
 */
export default function ProfileForm() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);

  const [name, setName] = useState("");
  const [nameBusy, setNameBusy] = useState(false);
  const [nameNote, setNameNote] = useState<Note>(null);

  const [email, setEmail] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailNote, setEmailNote] = useState<Note>(null);

  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwNote, setPwNote] = useState<Note>(null);
  const [reveal, setReveal] = useState(false);

  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoNote, setPhotoNote] = useState<Note>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/profile", { cache: "no-store" });
    if (!res.ok) return;
    const json: Profile = await res.json();
    setProfile(json);
    setName(json.full_name ?? "");
    setEmail(json.email ?? "");
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    setNameBusy(true);
    setNameNote(null);

    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ full_name: name }),
    }).catch(() => null);
    const json = await res?.json().catch(() => ({}));
    setNameBusy(false);

    if (!res?.ok) {
      setNameNote({ tone: "bad", text: json?.error ?? "Could not save your name." });
      return;
    }
    setNameNote({ tone: "ok", text: "Name updated." });
    await load();
    // The rail, the account menu and every bubble render this name.
    router.refresh();
  }

  async function changeEmail(e: React.FormEvent) {
    e.preventDefault();
    setEmailBusy(true);
    setEmailNote(null);

    const next = email.trim().toLowerCase();
    if (next === (profile?.email ?? "").toLowerCase()) {
      setEmailBusy(false);
      setEmailNote({ tone: "bad", text: "That is already your address." });
      return;
    }

    const { error } = await supabaseBrowser().auth.updateUser({ email: next });
    setEmailBusy(false);

    if (error) {
      setEmailNote({
        tone: "bad",
        // Supabase's built-in SMTP allows only a couple of messages an hour, and
        // its raw error says nothing about what to do next.
        text: /rate limit/i.test(error.message)
          ? "Too many emails sent recently — Supabase's built-in mail is rate limited. Wait an hour, or configure SMTP in the Supabase dashboard."
          : error.message,
      });
      return;
    }

    setEmailNote({
      tone: "ok",
      text: `Confirmation sent to ${next}. Your address changes once you open that link.`,
    });
    await load();
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwNote(null);

    if (newPw.length < 8) {
      setPwNote({ tone: "bad", text: "Use at least 8 characters." });
      return;
    }
    if (newPw !== confirmPw) {
      setPwNote({ tone: "bad", text: "The two new passwords do not match." });
      return;
    }
    if (newPw === currentPw) {
      setPwNote({ tone: "bad", text: "The new password matches the current one." });
      return;
    }

    setPwBusy(true);
    const sb = supabaseBrowser();

    // Supabase's updateUser() does NOT ask for the current password, so on its
    // own an unlocked laptop is enough to take an account over. Re-signing in
    // first is the standard check, and it costs one request.
    const { error: reauth } = await sb.auth.signInWithPassword({
      email: profile?.email ?? "",
      password: currentPw,
    });
    if (reauth) {
      setPwBusy(false);
      setPwNote({ tone: "bad", text: "Current password is incorrect." });
      return;
    }

    const { error } = await sb.auth.updateUser({ password: newPw });
    setPwBusy(false);

    if (error) {
      setPwNote({ tone: "bad", text: error.message });
      return;
    }
    setCurrentPw("");
    setNewPw("");
    setConfirmPw("");
    setPwNote({ tone: "ok", text: "Password changed. Other devices stay signed in." });
  }

  async function uploadPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoBusy(true);
    setPhotoNote(null);

    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/profile/avatar", { method: "POST", body: form }).catch(() => null);
    const json = await res?.json().catch(() => ({}));
    setPhotoBusy(false);
    e.target.value = "";

    if (!res?.ok) {
      setPhotoNote({ tone: "bad", text: json?.error ?? "Could not upload the photo." });
      return;
    }
    await load();
    router.refresh();
  }

  async function removePhoto() {
    setPhotoBusy(true);
    setPhotoNote(null);
    const res = await fetch("/api/profile/avatar", { method: "DELETE" }).catch(() => null);
    setPhotoBusy(false);
    if (!res?.ok) {
      setPhotoNote({ tone: "bad", text: "Could not remove the photo." });
      return;
    }
    await load();
    router.refresh();
  }

  if (!profile) return <p className="text-body text-muted">Loading your profile…</p>;

  return (
    <div className="space-y-4">
      {/* ---- identity ---- */}
      <section className="panel flex flex-wrap items-center gap-4 p-5">
        <Avatar name={profile.full_name} type="agent" size={64} src={profile.avatar_url} />

        <div className="min-w-0 flex-1">
          <p className="truncate text-h3 text-ink">{profile.full_name ?? "Unnamed"}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5">
            <Chip tone={profile.role === "owner" ? "bot" : "neutral"}>
              {profile.role ? ROLE_LABELS[profile.role] ?? profile.role : "Member"}
            </Chip>
            <span className="text-meta text-muted">{profile.workspace ?? "—"}</span>
          </p>
          {photoNote && <Note note={photoNote} />}
        </div>

        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            disabled={photoBusy}
            onClick={() => fileRef.current?.click()}
            className="btn-secondary"
          >
            {photoBusy ? "Working…" : profile.avatar_url ? "Change photo" : "Add photo"}
          </button>
          {profile.avatar_url && (
            <button
              type="button"
              disabled={photoBusy}
              onClick={removePhoto}
              className="btn-ghost text-danger hover:bg-danger-soft"
            >
              Remove
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={uploadPhoto}
          />
        </div>
      </section>

      {/* ---- name ---- */}
      <form onSubmit={saveName} className="panel space-y-3 p-5">
        <p className="eyebrow">Your details</p>

        <label className="block">
          <span className="mb-1 block text-meta font-medium text-ink">Full name</span>
          <input
            required
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="field"
          />
          <span className="mt-1 block text-caption text-subtle">
            Shown on the messages you send and to everyone in this workspace.
          </span>
        </label>

        {nameNote && <Note note={nameNote} />}

        <div className="flex justify-end">
          <button disabled={nameBusy || name.trim() === (profile.full_name ?? "")} className="btn-primary">
            {nameBusy ? "Saving…" : "Save name"}
          </button>
        </div>
      </form>

      {/* ---- email ---- */}
      <form onSubmit={changeEmail} className="panel space-y-3 p-5">
        <p className="eyebrow">Email</p>

        {profile.pending_email && (
          <p className="flex items-start gap-2 rounded-lg border border-bot/30 bg-bot-soft px-3 py-2 text-meta text-bot-dark">
            <Icon name="clock" size={14} className="mt-0.5 shrink-0" />
            Waiting for confirmation of {profile.pending_email}. Until that link is opened, you
            still sign in with {profile.email}.
          </p>
        )}

        <label className="block">
          <span className="mb-1 block text-meta font-medium text-ink">Address</span>
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="field"
          />
          <span className="mt-1 block text-caption text-subtle">
            You sign in with this. Changing it sends a confirmation link before it takes effect.
          </span>
        </label>

        {emailNote && <Note note={emailNote} />}

        <div className="flex justify-end">
          <button
            disabled={emailBusy || email.trim().toLowerCase() === (profile.email ?? "").toLowerCase()}
            className="btn-secondary"
          >
            {emailBusy ? "Sending…" : "Change email"}
          </button>
        </div>
      </form>

      {/* ---- password ---- */}
      <form onSubmit={changePassword} className="panel space-y-3 p-5">
        <p className="eyebrow">Password</p>

        {profile.has_password ? (
          <>
            <label className="block">
              <span className="mb-1 block text-meta font-medium text-ink">Current password</span>
              <input
                required
                type={reveal ? "text" : "password"}
                value={currentPw}
                onChange={(e) => setCurrentPw(e.target.value)}
                className="field"
                autoComplete="current-password"
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-meta font-medium text-ink">New password</span>
                <input
                  required
                  minLength={8}
                  type={reveal ? "text" : "password"}
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                  className="field"
                  autoComplete="new-password"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-meta font-medium text-ink">Confirm new password</span>
                <input
                  required
                  minLength={8}
                  type={reveal ? "text" : "password"}
                  value={confirmPw}
                  onChange={(e) => setConfirmPw(e.target.value)}
                  className="field"
                  autoComplete="new-password"
                />
              </label>
            </div>

            <label className="flex items-center gap-2 text-meta text-muted">
              <input
                type="checkbox"
                checked={reveal}
                onChange={(e) => setReveal(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-edge-strong text-brand focus:ring-brand/30"
              />
              Show passwords
            </label>

            {pwNote && <Note note={pwNote} />}

            <div className="flex justify-end">
              <button disabled={pwBusy} className="btn-primary">
                {pwBusy ? "Updating…" : "Change password"}
              </button>
            </div>
          </>
        ) : (
          <p className="text-meta text-muted">
            You sign in with Google, so there is no password here to change. Manage it in your
            Google account.
          </p>
        )}
      </form>
    </div>
  );
}

function Note({ note }: { note: NonNullable<Note> }) {
  const ok = note.tone === "ok";
  return (
    <p
      className={`flex items-start gap-2 text-meta ${ok ? "text-wa-dark" : "text-danger"}`}
      role="status"
    >
      <Icon name={ok ? "check" : "alert"} size={14} className="mt-0.5 shrink-0" />
      {note.text}
    </p>
  );
}
