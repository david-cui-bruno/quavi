import { useEffect, useState, type ReactNode } from "react";
import { useStore } from "./store";
import { useSocial, type Person, type PrivatePost } from "./social";
import { api } from "./cloud";
import { useRuntime } from "./runtime";
import { BackBtn, Btn, Screen$, Sheet, NoteQuote } from "./ui";
import { Persona, flock } from "./brand/Persona";
import { Photo } from "./CloudPhoto";
import { noteLines, photoLines, type Story } from "./data";

export function CircleStatus() {
  const { data, error, loading, refresh } = useSocial();
  return (
    <>
      {loading && !data && (
        <p role="status" className="small">
          Opening your circle…
        </p>
      )}
      {error && (
        <div role="alert">
          <p className="small">{error}</p>
          <button className="chip" onClick={() => void refresh()}>
            Try again
          </button>
        </div>
      )}
    </>
  );
}
function PersonFace({ person }: { person: Person }) {
  return (
    <div className="circle-face">
      <Persona spec={flock("Pip", "Orange")} size={44} />
      <span className="sr-only">{person.name}</span>
    </div>
  );
}
export function ReportSheet({
  person,
  postId,
  onClose,
}: {
  person: Person;
  postId?: string;
  onClose: () => void;
}) {
  const { command } = useSocial(),
    [reason, setReason] = useState("spam"),
    [details, setDetails] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [sent, setSent] = useState(false);
  const send = async () => {
    setBusy(true);
    setError("");
    try {
      await command("/reports", "POST", {
        targetId: person.id,
        postId,
        reason,
        details,
      });
      setSent(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet label="Report to Quavi" onClose={onClose}>
      <h2 className="h1 h-s">
        {sent ? "Report received." : "Report to Quavi."}
      </h2>
      {sent ? (
        <>
          <p className="body">
            Your report was recorded. You can also block this person to remove
            access between you. Reports are reviewed manually; there are no
            instant moderation notifications yet.
          </p>
          <Btn onClick={onClose}>Done</Btn>
        </>
      ) : (
        <>
          <p className="body">
            Reporting {person.name}. Your report is private to Quavi.
          </p>
          <label className="circle-field">
            Reason
            <select value={reason} onChange={(e) => setReason(e.target.value)}>
              <option value="spam">Spam</option>
              <option value="harassment">Harassment</option>
              <option value="unsafe">Unsafe content</option>
              <option value="other">Something else</option>
            </select>
          </label>
          <label className="field circle-field">
            What happened? (optional)
            <textarea
              value={details}
              maxLength={1000}
              rows={3}
              onChange={(e) => setDetails(e.target.value)}
            />
          </label>
          {error && <p role="alert">{error}</p>}
          <Btn disabled={busy} onClick={() => void send()}>
            {busy ? "Sending…" : "Send report"}
          </Btn>
        </>
      )}
    </Sheet>
  );
}
export function SocialFriends() {
  const { go } = useStore(),
    { data, command } = useSocial(),
    [query, setQuery] = useState(""),
    [handle, setHandle] = useState(""),
    [editingHandle, setEditingHandle] = useState(false),
    [people, setPeople] = useState<Person[] | null>(null),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [reported, setReported] = useState<Person | null>(null);
  const act = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  };
  const relationship = (p: Person, action: string) =>
    void act(action + p.id, () =>
      command("/relationships", "POST", { targetId: p.id, action }),
    );
  const button = (p: Person, action: string, label: string) => (
    <button
      className="chip"
      disabled={!!busy}
      onClick={() => relationship(p, action)}
    >
      {busy === action + p.id ? "Saving…" : label}
    </button>
  );
  const render = (p: Person, actions: ReactNode) => (
    <div key={p.id} className="circle-person">
      <div className="row" style={{ gap: 12 }}>
        <PersonFace person={p} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <b>{p.name}</b>
          <div className="small muted" style={{ overflowWrap: "anywhere" }}>
            @{p.handle}
          </div>
        </div>
      </div>
      <div className="circle-actions">{actions}</div>
    </div>
  );
  return (
    <Screen$ tabs="you" scroll>
      <BackBtn onClick={() => go("profile")} />
      <h1 className="h1 h-l" style={{ margin: "18px 0" }}>
        Friends.
      </h1>
      <CircleStatus />
      {error && (
        <p role="alert" className="small">
          {error}
        </p>
      )}
      {data && (
        <>
          <div className="circle-identity">
            <p className="small">Your friend handle</p>
            <b style={{ overflowWrap: "anywhere" }}>@{data.me.handle}</b>
            <p className="small muted">
              Give this to a friend. Only your name and handle appear in lookup.
            </p>
            <button
              className="chip"
              onClick={() => setEditingHandle((v) => !v)}
            >
              {editingHandle ? "Cancel handle change" : "Change handle"}
            </button>
            {editingHandle && (
              <>
                <form
                  className="circle-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void act("handle", async () => {
                      await command("/profile", "PUT", {
                        handle: handle.trim().replace(/^@/, "").toLowerCase(),
                      });
                      setEditingHandle(false);
                      setHandle("");
                    });
                  }}
                >
                  <label className="field">
                    <span>CHANGE YOUR HANDLE</span>
                    <input
                      aria-label="New friend handle"
                      autoCapitalize="none"
                      autoCorrect="off"
                      autoComplete="off"
                      value={handle}
                      maxLength={24}
                      placeholder="e.g. david_wanders"
                      onChange={(e) => setHandle(e.target.value)}
                    />
                  </label>
                  <button className="chip" disabled={!!busy || !handle.trim()}>
                    Save handle
                  </button>
                </form>
                <p className="small muted">
                  3–24 letters, numbers or underscores. Start with a letter.
                </p>
              </>
            )}
          </div>
          <form
            className="circle-form"
            onSubmit={(e) => {
              e.preventDefault();
              setPeople(null);
              void act("search", async () => {
                const r = (await command("/lookup", "POST", {
                  handle: query.trim().replace(/^@/, "").toLowerCase(),
                })) as { people: Person[] };
                setPeople(r.people);
              });
            }}
          >
            <label className="field">
              <span>FIND A FRIEND</span>
              <input
                aria-label="Friend handle"
                disabled={busy === "search"}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPeople(null);
                }}
                placeholder="Their exact handle"
                maxLength={25}
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="off"
              />
            </label>
            <button
              className="btn primary sm"
              disabled={!!busy || query.trim().length < 3}
            >
              {busy === "search" ? "Finding…" : "Find"}
            </button>
          </form>
          {people?.length === 0 && (
            <p className="small" role="status">
              No matching person. Check the exact handle with your friend.
            </p>
          )}
          {people?.map((p) =>
            render(
              p,
              data.friends.some((x) => x.id === p.id) ? (
                <span className="small">Already friends</span>
              ) : data.incoming.some((x) => x.id === p.id) ? (
                button(p, "accept", "Accept request")
              ) : data.outgoing.some((x) => x.id === p.id) ? (
                <span className="small">Request sent</span>
              ) : (
                button(p, "request", "Send request")
              ),
            ),
          )}
          {!!data.incoming.length && (
            <section>
              <h2 className="h1 h-xs">Friend requests</h2>
              {data.incoming.map((p) =>
                render(
                  p,
                  <>
                    {button(p, "accept", "Accept")}
                    {button(p, "decline", "Decline")}
                    {button(p, "block", "Block")}
                  </>,
                ),
              )}
            </section>
          )}
          {!!data.outgoing.length && (
            <section>
              <h2 className="h1 h-xs">Waiting for a reply</h2>
              {data.outgoing.map((p) =>
                render(p, button(p, "cancel", "Cancel request")),
              )}
            </section>
          )}
          <section>
            <h2 className="h1 h-xs">Your circle · {data.friends.length}</h2>
            {!data.friends.length && (
              <p className="body muted">
                No friends yet. Find someone by their handle and send a request.
                Stories stay private until you choose to share.
              </p>
            )}
            {data.friends.map((p) =>
              render(
                p,
                <>
                  {button(p, "remove", "Remove")}
                  {button(p, "block", "Block")}
                  <button className="chip" onClick={() => setReported(p)}>
                    Report
                  </button>
                </>,
              ),
            )}
          </section>
          {!!data.blocked.length && (
            <section>
              <h2 className="h1 h-xs">Blocked</h2>
              <p className="small muted">
                Unblocking does not restore a friendship.
              </p>
              {data.blocked.map((p) =>
                render(p, button(p, "unblock", "Unblock")),
              )}
            </section>
          )}
          <p className="small muted">
            Removing or blocking a friend stops new story and photo access
            between you. Content already downloaded or copied cannot be
            recalled.
          </p>
        </>
      )}
      {reported && (
        <ReportSheet person={reported} onClose={() => setReported(null)} />
      )}
    </Screen$>
  );
}

export function PrivateShare({
  story,
  onClose,
}: {
  story: Story;
  onClose: () => void;
}) {
  const { data, publish, unpublish } = useSocial(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [done, setDone] = useState(false);
  const post = data?.myPosts.find((p) => p.outingId === story.id);
  const send = async (remove = false) => {
    setBusy(true);
    setError("");
    try {
      if (remove && post) await unpublish(post.id);
      else await publish(story.id);
      setDone(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet label="Share with your circle" onClose={onClose}>
      <h2 className="h1 h-s">{done ? "Circle updated." : story.title}</h2>
      {done ? (
        <>
          <p className="body">Your sharing choice is saved to Quavi.</p>
          <Btn onClick={onClose}>Done</Btn>
        </>
      ) : (
        <>
          <p className="body">
            Only accepted friends can read this story. Your title, captions,
            intro, task notes and task photos below will be visible. Your
            starting location and GPS/arrival data stay private.
          </p>
          <p className="small muted">
            New accepted friends can see shared stories too. Saved edits update
            the shared story. Stop sharing whenever you want; already downloaded
            content cannot be recalled. Photo links already issued can last up
            to five minutes.
          </p>
          <CircleStatus />
          {story.intro && <p className="it">{story.intro}</p>}
          {story.chapters.map((c, i) => (
            <section key={i} className="circle-preview">
              <h3 className="h1 h-xs">{c.place}</h3>
              <p>{story.captions[i] || c.place}</p>
              {noteLines(story)
                .filter((n) => n.chapter === i)
                .map((n) => (
                  <NoteQuote key={n.task} task={n.task} note={n.note} />
                ))}
              {photoLines(story)
                .filter((p) => p.chapter === i)
                .map((p) => (
                  <Photo
                    key={p.task}
                    src={p.img}
                    alt={p.task}
                    style={{
                      width: "100%",
                      maxHeight: 180,
                      objectFit: "cover",
                      borderRadius: 20,
                    }}
                  />
                ))}
            </section>
          ))}
          {!data?.friends.length && (
            <p className="small">
              Your circle is empty. You can share now; accepted friends will be
              able to read it when they join.
            </p>
          )}
          {error && <p role="alert">{error}</p>}
          <Btn disabled={busy || !data} onClick={() => void send()}>
            {busy
              ? "Saving…"
              : post
                ? "Update shared story"
                : "Share with accepted friends"}
          </Btn>
          {post && (
            <Btn kind="soft" disabled={busy} onClick={() => void send(true)}>
              Stop sharing
            </Btn>
          )}
        </>
      )}
    </Sheet>
  );
}
export function PrivateStory() {
  const { account, route, go, back } = useStore(),
    { data, command } = useSocial(),
    life = useRuntime(),
    [post, setPost] = useState<PrivatePost | null>(null),
    [error, setError] = useState(""),
    [reporting, setReporting] = useState(false),
    [ticket, setTicket] = useState(0);
  const id = String(route.params?.id ?? "");
  useEffect(() => {
    let active = true;
    setPost(null);
    setError("");
    if (!account || !data || !life.active || !life.online) return;
    void api<PrivatePost>(account, "/social/posts/" + id)
      .then((p) => {
        if (active) setPost(p);
      })
      .catch((e) => {
        if (active) setError((e as Error).message);
      });
    return () => {
      active = false;
    };
  }, [account, id, data, life.active, life.online, ticket]);
  const shown = life.online && life.active && data ? post : null;
  return (
    <Screen$ scroll>
      <BackBtn onClick={back} />
      <CircleStatus />
      {error && <p role="alert">{error}</p>}
      {!shown ? (
        <>
          <p className="body">
            {error
              ? "This story may have been unshared, or your circle access changed."
              : "Connect to open this private story."}
          </p>
          <Btn kind="soft" onClick={() => setTicket((x) => x + 1)}>
            Try again
          </Btn>
        </>
      ) : (
        <>
          <div className="row" style={{ gap: 12, margin: "18px 0 12px" }}>
            <PersonFace person={shown.owner} />
            <div style={{ minWidth: 0 }}>
              <b>{shown.owner.name}’s story</b>
              <p className="small muted" style={{ overflowWrap: "anywhere" }}>
                @{shown.owner.handle} · Friends only
              </p>
            </div>
          </div>
          <div
            className="clip"
            style={{
              position: "relative",
              borderRadius: 32,
              minHeight: 190,
              background: "var(--orange-p)",
              padding: "24px 108px 24px 24px",
              marginBottom: 18,
              flex: "none",
            }}
          >
            <h1
              className="h1 h-s"
              style={{
                position: "relative",
                zIndex: 1,
                overflowWrap: "anywhere",
              }}
            >
              {shown.story.title}
            </h1>
            <div
              aria-hidden="true"
              style={{ position: "absolute", right: 0, bottom: -34 }}
            >
              <Persona spec={flock("Pip", "Yellow")} size={140} />
            </div>
          </div>
          {shown.story.intro && <p className="it">{shown.story.intro}</p>}
          {shown.story.chapters.map((c, i) => (
            <section className="circle-preview" key={i}>
              <h2 className="h1 h-xs">{c.place}</h2>
              <p className="it">{shown.story.captions[i] || c.place}</p>
              {noteLines(shown.story)
                .filter((n) => n.chapter === i)
                .map((n) => (
                  <NoteQuote key={n.task} task={n.task} note={n.note} />
                ))}
              {photoLines(shown.story)
                .filter((p) => p.chapter === i)
                .map((p) => (
                  <Photo
                    src={p.img}
                    key={p.task}
                    alt={p.task}
                    style={{
                      width: "100%",
                      maxHeight: 240,
                      objectFit: "cover",
                      borderRadius: 24,
                    }}
                  />
                ))}
            </section>
          ))}
          <p className="small muted">
            Private circle stories stay online and are not saved into your
            offline library.
          </p>
          <Btn kind="soft" onClick={() => go("mood")}>
            Plan my own detour
          </Btn>
          {!shown.mine && (
            <div className="circle-actions">
              <button className="chip" onClick={() => setReporting(true)}>
                Report story
              </button>
              <button
                className="chip"
                onClick={() =>
                  void command("/relationships", "POST", {
                    targetId: shown.owner.id,
                    action: "block",
                  })
                    .then(() => go("circle"))
                    .catch((e) => setError(e.message))
                }
              >
                Block {shown.owner.name}
              </button>
            </div>
          )}
          {reporting && (
            <ReportSheet
              person={shown.owner}
              postId={id}
              onClose={() => setReporting(false)}
            />
          )}
        </>
      )}
    </Screen$>
  );
}
