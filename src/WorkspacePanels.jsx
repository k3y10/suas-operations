import React, { useEffect, useRef, useState } from "react";
import { ClipboardList, Download, Trash2, ExternalLink, X } from "lucide-react";
import { client } from "./client.js";
import { download } from "./drafts.js";
import RunTrace from "./RunTrace.jsx";
export function DraftList({ drafts, remove, review }) {
  return drafts.length ? (
    <div className="draft-list">
      {drafts.map((d) => (
        <article key={d.id}>
          <span className="small-label">Local draft · not authorized</span>
          <h3>{d.objective}</h3>
          <p>{d.world}</p>
          <small>{new Date(d.createdAt).toLocaleString()}</small>
          <div>
            {d.plan && review && <button className="outline" onClick={()=>review(d)}>Review</button>}
            <button
              className="outline"
              onClick={() => download(d, "terrasatch-draft-" + d.id + ".json")}
            >
              <Download size={15} />
              Export
            </button>
            <button
              className="icon-button"
              aria-label={"Remove " + d.objective}
              onClick={() => remove(d.id)}
            >
              <Trash2 size={16} />
            </button>
          </div>
        </article>
      ))}
    </div>
  ) : (
    <div className="empty">
      <ClipboardList />
      <h3>No local drafts</h3>
      <p>
        Create a planning draft from Mission. Drafts cannot launch a drone.
      </p>
    </div>
  );
}
export function ReadPanel({
  section,
  signedIn,
  offline,
  org,
  data,
  error,
  loading,
  load,
  login,
}) {
  const items = Array.isArray(data) ? data : data?.items || data?.regions || [];
  return (
    <>
      <button
        className="outline"
        disabled={offline || loading || (signedIn && !org)}
        onClick={signedIn ? load : login}
      >
        {loading
          ? "Loading…"
          : signedIn
            ? "Load authorized context"
            : "Sign in to load context"}
      </button>
      {offline && <p className="notice">Offline · live context unavailable</p>}
      {error && (
        <p className="feedback" role="alert">
          {error}
        </p>
      )}
      {data && (
        <>
          <p className="hint">
            {items.length} records returned
            {data.truncated ? " · narrowed result required" : ""}.
          </p>
          {data.warnings?.map((w, i) => (
            <p className="hint" key={i}>
              {w}
            </p>
          ))}
          <div className="source-list">
            {items.map((item, i) => (
              <article key={item.id || i}>
                <h3>
                  {item.name ||
                    item.summary ||
                    item.input_text ||
                    "Workspace record"}
                </h3>
                <p>{item.provider_id || item.source || item.status || ""}</p>
                {item.source_updated_at && (
                  <small>Source updated: {item.source_updated_at}</small>
                )}
                {item.avalanche_rating && (
                  <p>
                    Forecast: {item.avalanche_rating.status}
                    {item.avalanche_rating.level
                      ? " · level " + item.avalanche_rating.level
                      : ""}
                  </p>
                )}
                {safeLink(item.source_url) && (
                  <a href={item.source_url} target="_blank" rel="noreferrer">
                    View source <ExternalLink size={12} />
                  </a>
                )}
                {section === "Reports" && <details className="mission-detail"><summary>Inspect execution trace</summary><RunTrace run={item}/></details>}
                {section === "Reports" && (
                  <button
                    className="text-button"
                    onClick={() =>
                      download(item, "satchy-run-" + item.id + ".json")
                    }
                  >
                    Export authorized run
                  </button>
                )}
              </article>
            ))}
          </div>
        </>
      )}
      {!data && !loading && (
        <p className="hint">
          No private records are cached for offline use.{" "}
          {section.includes("Context")
            ? "Published observations remain distinct from local simulation drafts."
            : ""}
        </p>
      )}
    </>
  );
}
function safeLink(value) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}
export function LoginDialog({ session, offline, close, connected }) {
  const ref = useRef(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    ref.current.showModal();
  }, []);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(e.currentTarget);
    try {
      const current = await client.workspaceSession();
      await client.loginWorkspace(
        form.get("email"),
        form.get("password"),
        current.csrf_token,
      );
      await connected();
    } catch (x) {
      setError(x.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog ref={ref} onCancel={close}>
      <div className="dialog-heading">
        <h2>
          {session?.user ? "Workspace connected" : "Sign in to TerraSatch"}
        </h2>
        <button
          className="icon-button"
          aria-label="Close sign in"
          onClick={close}
        >
          <X />
        </button>
      </div>
      {session?.user ? (
        <>
          <p>
            Signed in as {session.user.name}. Choose your organization in
            Settings.
          </p>
          <button className="primary" onClick={close}>
            Continue planning
          </button>
        </>
      ) : (
        <form onSubmit={submit}>
          <p>Use your existing TerraSatch workspace account.</p>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
            autoFocus
          />
          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
          <button className="primary" disabled={busy || offline}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
          {error && (
            <p role="alert" className="feedback">
              {error}
            </p>
          )}
          <p className="hint">
            Your password is sent to the canonical TerraSatch API and is never
            saved in this app.
          </p>
        </form>
      )}
    </dialog>
  );
}
