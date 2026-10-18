import { Photo } from "./CloudPhoto";
import type { Story } from "./data";
import { useEffect, useState, useRef, useCallback } from "react";
import { useStore } from "./store";
import { useSocial } from "./social";
import { api, auth } from "./cloud";
import { useRuntime } from "./runtime";
import { BackBtn, Btn, Screen$, Sheet } from "./ui";
import { enablePush, detachPush, nativePush } from "./push";
type Notice = {
  id: string;
  kind: string;
  actor?: { name: string };
  postId?: string;
  read: boolean;
  createdAt: string;
};
type Inbox = { items: Notice[]; unread: number; nextCursor: string | null };
export function Notifications() {
  const { account, go } = useStore(),
    life = useRuntime();
  const sequence = useRef(0);
  const [saved, setData] = useState<(Inbox & { uid: string }) | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [push, setPush] = useState("");
  const data =
    saved?.uid === account?.uid && life.online && life.active ? saved : null;
  const load = useCallback(
    async (cursor?: string) => {
      if (!account || !life.online || !life.active) return;
      const uid = account.uid,
        ticket = ++sequence.current;
      const page = await api<Inbox>(
        account,
        "/social/notifications" +
          (cursor ? "?cursor=" + encodeURIComponent(cursor) : ""),
      );
      if (auth.currentUser?.uid !== uid || ticket !== sequence.current) return;
      setData((old) =>
        cursor && old?.uid === uid
          ? {
              ...page,
              uid,
              items: [
                ...new Map(
                  [...old.items, ...page.items].map((x) => [x.id, x]),
                ).values(),
              ],
            }
          : { ...page, uid },
      );
    },
    [account, life.online, life.active],
  );
  useEffect(() => {
    let current = true;
    setData(null);
    setError("");
    if (life.online && life.active)
      void load().catch((e) => {
        if (current) setError(e.message);
      });
    return () => {
      current = false;
      sequence.current++;
    };
  }, [account?.uid, life.online, life.active, load]);
  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const mark = async (ids: string[]) => {
    if (!account || !ids.length) return;
    await api(account, "/social/notifications/read", "POST", { ids });
    await load();
  };
  return (
    <Screen$ scroll tabs="you">
      <BackBtn />
      <h1 className="h1 h-l" style={{ margin: "16px 0" }}>
        Your circle,
        <br />
        caught up.
      </h1>
      <p className="body">
        Friend requests, new stories and private report updates.
      </p>
      {!life.online && <p role="status">Connect to see your notifications.</p>}
      {error && (
        <p role="alert">
          {error}{" "}
          <button className="chip" onClick={() => void act(() => load())}>
            Try again
          </button>
        </p>
      )}
      {data && life.online && (
        <>
          <div
            className="row"
            style={{ justifyContent: "space-between", margin: "14px 0" }}
          >
            <b>{data.unread ? `${data.unread} unread` : "All caught up"}</b>
            <button
              className="chip"
              disabled={busy || !data.items.some((n) => !n.read)}
              onClick={() =>
                void act(() =>
                  mark(data.items.filter((n) => !n.read).map((n) => n.id)),
                )
              }
            >
              Mark shown as read
            </button>
          </div>
          {!data.items.length && (
            <p className="body muted" style={{ padding: "24px 0" }}>
              Nothing here yet. Updates from your circle will arrive here.
            </p>
          )}
          {data.items.map((n) => (
            <button
              key={n.id}
              className="notice-row"
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  await mark([n.id]);
                  if (auth.currentUser?.uid !== account?.uid) return;
                  go(
                    n.kind === "story_shared"
                      ? "friend"
                      : n.kind === "report_update"
                        ? "notifications"
                        : "friends",
                    n.postId ? { id: n.postId } : undefined,
                  );
                })
              }
            >
              <span
                className={"notice-dot " + (n.read ? "read" : "")}
                aria-label={n.read ? "Read" : "Unread"}
              />
              <span>
                <b>
                  {n.kind === "friend_request"
                    ? `${n.actor?.name} sent a friend request`
                    : n.kind === "friend_accepted"
                      ? `${n.actor?.name} accepted your request`
                      : n.kind === "story_shared"
                        ? `${n.actor?.name} shared a story`
                        : "Your report has been reviewed"}
                </b>
                <span
                  className="small muted"
                  style={{ display: "block", marginTop: 4 }}
                >
                  {new Date(n.createdAt).toLocaleDateString()} ·{" "}
                  {n.kind === "report_update"
                    ? "Review complete. Thank you for helping keep Quavi safe."
                    : n.kind === "story_shared"
                      ? "Open story"
                      : "Open friends"}
                </span>
              </span>
            </button>
          ))}
          {data.nextCursor && (
            <Btn
              kind="soft"
              disabled={busy}
              onClick={() => void act(() => load(data.nextCursor!))}
            >
              Older updates
            </Btn>
          )}
        </>
      )}
      {nativePush() && (
        <div style={{ marginTop: 24 }}>
          <h2 className="h1 h-s">On your iPhone.</h2>
          <p className="small">
            Optional alerts show a generic Quavi update. Names, story text and
            locations stay inside the app.
          </p>
          <div className="row">
            <button
              className="chip"
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  await enablePush();
                  setPush("Notifications enabled on this phone.");
                })
              }
            >
              Enable push
            </button>
            <button
              className="chip"
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  await detachPush();
                  setPush(
                    "Push is off on this phone. Your inbox stays available.",
                  );
                })
              }
            >
              Turn off push
            </button>
          </div>
          {push && <p role="status">{push}</p>}
        </div>
      )}
    </Screen$>
  );
}
type Report = {
  id: string;
  reason: string;
  details: string;
  createdAt: string;
  target: { name: string; handle: string };
  reporterHandle: string;
  postId?: string;
};
export function Moderation() {
  const { account } = useStore(),
    { data: social } = useSocial(),
    life = useRuntime();
  const [reports, setReports] = useState<Report[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [error, setError] = useState(""),
    [selected, setSelected] = useState<Report | null>(null),
    [action, setAction] = useState("dismiss"),
    [note, setNote] = useState(""),
    [busy, setBusy] = useState(false),
    [evidence, setEvidence] = useState<Story | null>(null);
  const load = useCallback(
    async (next?: string) => {
      if (!account) return;
      const r = await api<{ items: Report[]; nextCursor: string | null }>(
        account,
        "/social/moderation" +
          (next ? "?cursor=" + encodeURIComponent(next) : ""),
      );
      if (auth.currentUser?.uid !== account.uid) return;
      setReports((old) => (next ? [...old, ...r.items] : r.items));
      setCursor(r.nextCursor);
    },
    [account],
  );
  useEffect(() => {
    setReports([]);
    if (social?.canModerate && life.online)
      void load().catch((e) => setError(e.message));
  }, [account?.uid, social?.canModerate, life.online, load]);
  return (
    <Screen$ scroll>
      <BackBtn />
      <h1 className="h1 h-l" style={{ margin: "16px 0" }}>
        Review reports.
      </h1>
      <p className="body">
        Private staff queue. Decisions are recorded. Reporter identities and
        staff notes never appear in circle updates.
      </p>
      {!social?.canModerate ? (
        <p>Moderator access required.</p>
      ) : (
        <>
          {!reports.length && <p className="body">No open reports.</p>}
          {reports.map((r) => (
            <button
              className="notice-row"
              key={r.id}
              onClick={() => {
                setSelected(r);
                setNote("");
                setAction("dismiss");
                setEvidence(null);
              }}
            >
              <span>
                <b>
                  {r.reason} · @{r.target.handle}
                </b>
                <span className="small" style={{ display: "block" }}>
                  Reported {new Date(r.createdAt).toLocaleDateString()}
                </span>
              </span>
            </button>
          ))}
          {cursor && (
            <Btn
              onClick={() =>
                void load(cursor).catch((e) => setError(e.message))
              }
            >
              Older reports
            </Btn>
          )}
        </>
      )}
      {error && <p role="alert">{error}</p>}
      {selected && (
        <Sheet
          label="Review report"
          onClose={() => {
            if (!busy) setSelected(null);
          }}
        >
          <h2 className="h1 h-s">@{selected.target.handle}</h2>
          <p className="body">
            {selected.reason} · reported by @{selected.reporterHandle}
          </p>
          <p className="body" style={{ whiteSpace: "pre-wrap" }}>
            {selected.details || "No additional details."}
          </p>
          {selected.postId && (
            <button
              className="chip"
              onClick={() =>
                void api<{ story: Story }>(
                  account!,
                  "/social/moderation/" + selected.id,
                )
                  .then((r) => setEvidence(r.story))
                  .catch((e) => setError(e.message))
              }
            >
              Read reported story
            </button>
          )}
          {evidence && (
            <div>
              <h3 className="h1 h-s">{evidence.title}</h3>
              {evidence.captions.map((c, i) => (
                <p key={i}>{c}</p>
              ))}
              {evidence.sharedNotes?.map((n, i) => (
                <p key={"note" + i}>
                  {n.place}: {n.note}
                </p>
              ))}
              {evidence.sharedPhotos?.map((p, i) => (
                <Photo
                  key={i}
                  src={p.img}
                  alt={`Reported story photo at ${p.place}`}
                  style={{
                    width: "100%",
                    maxHeight: 300,
                    objectFit: "contain",
                  }}
                />
              ))}
            </div>
          )}
          <label className="circle-field">
            Decision
            <select value={action} onChange={(e) => setAction(e.target.value)}>
              <option value="dismiss">Resolve without action</option>
              {selected.postId && (
                <option value="hide_story">
                  Remove this story from sharing
                </option>
              )}
              <option value="restrict_user">
                Restrict sharing and requests for 7 days
              </option>
            </select>
          </label>
          <label className="field circle-field">
            Private decision note
            <textarea
              value={note}
              maxLength={1000}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
            />
          </label>
          <p className="small">
            {action === "hide_story"
              ? "The owner keeps their private outing. This story cannot be shared again."
              : action === "restrict_user"
                ? "Private outings, blocking and reporting stay available."
                : "The report will be closed."}
          </p>
          {error && <p role="alert">{error}</p>}
          <Btn
            disabled={busy || note.trim().length < 3 || !life.online}
            onClick={() => {
              setBusy(true);
              void api(account!, "/social/moderation", "POST", {
                reportId: selected.id,
                action,
                note,
              })
                .then(async () => {
                  setSelected(null);
                  await load();
                })
                .catch((e) => setError(e.message))
                .finally(() => setBusy(false));
            }}
          >
            Confirm decision
          </Btn>
        </Sheet>
      )}
    </Screen$>
  );
}
