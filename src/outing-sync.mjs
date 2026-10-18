import { scrubGoogleContent } from "./google-retention.mjs";
const clone = (v) => structuredClone(v);
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const object = (v) => v && typeof v === "object" && !Array.isArray(v);
const plain = (r) => {
  const { revision: _revision, updatedAt: _updatedAt, ...value } = r;
  return value;
};
export function diffOuting(before, after, path = []) {
  if (equal(before, after)) return [];
  if (
    (object(before) || before === undefined) &&
    (object(after) || after === undefined) &&
    (object(before) || object(after))
  )
    return [
      ...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]),
    ].flatMap((k) => diffOuting(before?.[k], after?.[k], [...path, k]));
  return [
    {
      path,
      ...(before === undefined ? {} : { before }),
      ...(after === undefined ? {} : { after }),
    },
  ];
}
function apply(record, changes) {
  const out = clone(record);
  for (const { path, after } of changes) {
    let p = out;
    for (const k of path.slice(0, -1)) p = p[k] ??= {};
    if (after === undefined) delete p[path.at(-1)];
    else p[path.at(-1)] = clone(after);
  }
  return out;
}
export function extractOutings(state) {
  const stories = new Map();
  for (const story of [
    ...Object.values(state.library),
    ...state.shelf,
    ...(state.story ? [state.story] : []),
  ])
    stories.set(story.id, story);
  return [...stories.values()].map((story) => ({
    id: story.id,
    story: scrubGoogleContent(story),
    status:
      story.outingPhase ??
      (story.status === "done"
        ? "completed"
        : story.status === "active"
          ? "paused"
          : "planned"),
    chapter:
      state.story?.id === story.id
        ? Math.min(state.chapter, story.chapters.length - 1)
        : 0,
    tasks: Object.fromEntries(
      Object.entries(state.game.done)
        .filter(([k]) => k.startsWith(story.id + ":"))
        .flatMap(([k, ids]) =>
          ids.map((id) => [k.slice(story.id.length + 1) + "/" + id, true]),
        ),
    ),
    collected: Object.fromEntries(
      (state.game.collected[story.id] ?? []).map((n) => [String(n), true]),
    ),
    tripXp: state.game.tripXp[story.id] ?? 0,
    inShelf: state.shelf.some((x) => x.id === story.id),
    inLibrary: !!state.library[story.id],
  }));
}
export function profileOnly(state) {
  return {
    ...state,
    demoRedemptions:[],
    story: undefined,
    chapter: 0,
    shelf: [],
    library: {},
    game: { ...state.game, xp:0,coins:0,streak:0,badges:[],done: {}, collected: {}, tripXp: {} },
  };
}
/** One IndexedDB transaction checkpoints base records and their retry journal together, including offline photos. */
export function outingStorage() {
  let database;
  async function db() {
    return (database ??= new Promise((resolve, reject) => {
      const r = indexedDB.open("quavi-outings-v1", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("accounts");
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    }));
  }
  return {
    async read(uid) {
      const d = await db();
      return new Promise((resolve, reject) => {
        const r = d.transaction("accounts").objectStore("accounts").get(uid);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
    },
    async write(uid, value) {
      const d = await db();
      return new Promise((resolve, reject) => {
        const t = d.transaction("accounts", "readwrite");
        t.objectStore("accounts").put(value, uid);
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      });
    },
    async remove(uid) {
      const d = await db();
      return new Promise((resolve, reject) => {
        const t = d.transaction("accounts", "readwrite");
        t.objectStore("accounts").delete(uid);
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error);
      });
    },
  };
}
export class OutingSync {
  constructor({
    uid,
    storage,
    request,
    prepare = async (v) => v,
    available = () => true,
    onChange = () => {},
    onStatus = () => {},
    uuid = () => crypto.randomUUID(),
  }) {
    Object.assign(this, {
      uid,
      storage,
      request,
      prepare,
      available,
      onChange,
      onStatus,
      uuid,
    });
    this.cache = { version: 1, records: [], pending: [], pendingRewards: [], selected: null };
    this.checkpoint = Promise.resolve();
    this.closed = false;
    this.loaded = false;
    this.status = "pending";
  }
  report(status) {
    this.status = status;
    if (!this.closed) this.onStatus(status);
  }
  view() {
    let records = clone(this.cache.records);
    for (const item of this.cache.pending) {
      const op = item.op,
        index = records.findIndex((r) => r.id === op.outingId);
      if (op.kind === "create") {
        if (index < 0) records.push(clone(op.record));
        else records[index] = clone(op.record);
      } else if (index >= 0) records[index] = apply(records[index], op.changes);
    }
    return records;
  }
  emit() {
    if (!this.closed) this.onChange();
  }
  save() {
    const value = clone(this.cache);
    this.checkpoint = this.checkpoint
      .catch(() => {})
      .then(() => this.storage.write(this.uid, value));
    return this.checkpoint.then(
      () => {
        this.storageFailed = false;
      },
      (error) => {
        this.storageFailed = true;
        this.report("storage-full");
        throw error;
      },
    );
  }
  async open(legacy, dirty = false) {
    this.cache.records = extractOutings(legacy);
    this.cache.selected = legacy.story?.id ?? null;
    this.cache.pending = this.cache.records.map((record) => ({
      op: {
        kind: "create",
        operationId: this.uuid(),
        outingId: record.id,
        record,
      },
      legacy: !dirty,
    }));
    this.unread = true;
    try {
      const saved = await this.storage.read(this.uid);
      if (this.closed) return;
      if (
        saved?.version === 1 &&
        Array.isArray(saved.records) &&
        Array.isArray(saved.pending)
      )
        this.cache = saved;
      else {
        this.cache.records = extractOutings(legacy);
        this.cache.selected = legacy.story?.id ?? null;
        this.cache.pending = this.cache.records.map((record) => ({
          op: {
            kind: "create",
            operationId: this.uuid(),
            outingId: record.id,
            record,
          },
          legacy: !dirty,
        }));
      }
      this.unread = false;
      this.loaded = true;
      await this.save();
      this.emit();
      await this.flush();
    } catch {
      if (!this.closed) {
        this.loaded = true;
        this.report("storage-full");
        this.emit();
      }
    }
  }
  project(profile) {
    const records = this.view().filter((r) => r.status !== "abandoned"),
      state = profileOnly(profile),
      done = {},
      collected = {},
      tripXp = {};
    const storyOf = (r) => ({
      ...r.story,
      outingPhase: r.status,
      ...(r.status === "completed"
        ? { status: "done" }
        : ["active", "paused"].includes(r.status)
          ? { status: "active" }
          : {}),
    });
    for (const r of records) {
      for (const [key, on] of Object.entries(r.tasks)) {
        if (!on) continue;
        const at = key.lastIndexOf("/"),
          k = r.id + ":" + key.slice(0, at);
        (done[k] ??= []).push(key.slice(at + 1));
      }
      collected[r.id] = Object.keys(r.collected)
        .filter((k) => r.collected[k])
        .map(Number);
      tripXp[r.id] = r.tripXp;
    }
    // Resume the locally selected outing; another device's active outing is picked only if none was selected here.
    const current =
      records.find((r) => r.id === this.cache.selected) ??
      records.find((r) => ["active", "paused"].includes(r.status));
    return {
      ...state,
      demoRedemptions:this.cache.rewards?.redemptions??[],
      story: current ? storyOf(current) : undefined,
      chapter: current?.chapter ?? 0,
      shelf: records.filter((r) => r.inShelf).map(storyOf),
      library: Object.fromEntries(
        records.filter((r) => r.inLibrary).map((r) => [r.id, storyOf(r)]),
      ),
      game: { ...state.game, ...(this.cache.rewards?{xp:this.cache.rewards.xp,coins:this.cache.rewards.coins,streak:this.cache.rewards.streak,badges:this.cache.rewards.badges}:{}), done, collected, tripXp },
    };
  }
  edit(before, next) {
    const old = new Map(extractOutings(before).map((r) => [r.id, r])),
      existing = new Map(this.view().map((r) => [r.id, plain(r)]));
    this.cache.selected = next.story?.id ?? null;
    for (const record of extractOutings(next)) {
      const previous = old.get(record.id),
        base = existing.get(record.id);
      // Updating a shelf copy must not reset its saved chapter/progress just because it isn't selected.
      if (next.story?.id !== record.id && base) {
        record.chapter = base.chapter;
        record.tasks = base.tasks;
        record.collected = base.collected;
        record.tripXp = base.tripXp;
        if (previous) {
          previous.chapter = base.chapter;
          previous.tasks = base.tasks;
          previous.collected = base.collected;
          previous.tripXp = base.tripXp;
        }
      }
      const changes = previous
        ? diffOuting(previous, record)
        : base
          ? diffOuting(base, record)
          : [];
      if (base && !changes.length) continue;
      const last = this.cache.pending.at(-1);
      if (
        last &&
        !last.attempted &&
        !last.preparing &&
        !last.conflict &&
        last.op.outingId === record.id
      ) {
        last.legacy = false;
        if (last.op.kind === "create")
          last.op.record = apply(last.op.record, changes);
        else {
          const merged = new Map(
            last.op.changes.map((c) => [JSON.stringify(c.path), c]),
          );
          for (const c of changes) {
            const key = JSON.stringify(c.path),
              prior = merged.get(key);
            merged.set(
              key,
              prior
                ? {
                    path: c.path,
                    ...("before" in prior ? { before: prior.before } : {}),
                    ...("after" in c ? { after: c.after } : {}),
                  }
                : c,
            );
          }
          last.op.changes = [...merged.values()].filter(
            (c) => !equal(c.before, c.after),
          );
          if (!last.op.changes.length) this.cache.pending.pop();
        }
      } else
        this.cache.pending.push({
          op: base
            ? {
                kind: "patch",
                operationId: this.uuid(),
                outingId: record.id,
                changes,
              }
            : {
                kind: "create",
                operationId: this.uuid(),
                outingId: record.id,
                record,
              },
        });
    }
    // Discard is an explicit terminal record, rather than deleting progress from the journal.
    if (before.story && !next.story) {
      const r = existing.get(before.story.id);
      if (r && !["completed", "abandoned"].includes(r.status))
        this.cache.pending.push({
          op: {
            kind: "patch",
            operationId: this.uuid(),
            outingId: r.id,
            changes: [
              { path: ["status"], before: r.status, after: "abandoned" },
            ],
          },
        });
    }
    void this.save()
      .then(() => {
        this.emit();
        clearTimeout(this.timer);
        this.timer = setTimeout(() => void this.flush(), 800);
      })
      .catch(() => {});
    this.report("pending");
  }
  async pull() {
    const result = await this.request("GET");
    if (this.closed) return;
    this.cache.records = result.outings;
    if(result.rewards)this.cache.rewards=result.rewards;
    this.cache.pending = this.cache.pending.filter(
      (item) =>
        !item.legacy || !result.outings.some((r) => r.id === item.op.outingId),
    );
    await this.save();
    this.emit();
  }
  async flush() {
    if (this.closed || !this.loaded || this.running) return;
    if (!this.available()) {
      this.report(
        this.storageFailed || this.unread ? "storage-full" : "offline",
      );
      return;
    }
    this.running = true;
    try {
      if (this.unread) {
        const saved = await this.storage.read(this.uid);
        if (this.closed) return;
        if (saved?.version === 1) {
          const pending = new Map(
            [...saved.pending, ...this.cache.pending].map((item) => [
              item.op.operationId,
              item,
            ]),
          );
          this.cache = {
            ...saved,
            selected: this.cache.selected ?? saved.selected,
            pending: [...pending.values()],
          };
        }
        this.unread = false;
      }
      await this.save();
      await this.pull();
      while (!this.closed && this.available()) {
        const blocked = new Set(
          this.cache.pending
            .filter((x) => x.conflict)
            .map((x) => x.op.outingId),
        );
        const item = this.cache.pending.find(
          (x) => !blocked.has(x.op.outingId),
        );
        if (!item) break;
        this.report("saving");
        if (!item.attempted) {
          item.preparing = true;
          const prepared = await this.prepare(clone(item.op));
          if (this.closed) return;
          const replacements = new Map();
          const discover = (a, b) => {
            if (typeof a === "string" && a.startsWith("data:image/") && a !== b)
              replacements.set(a, b);
            else if (a && typeof a === "object")
              for (const k of Object.keys(a)) discover(a[k], b?.[k]);
          };
          discover(item.op, prepared);
          const replace = (v) =>
            typeof v === "string"
              ? (replacements.get(v) ?? v)
              : Array.isArray(v)
                ? v.map(replace)
                : object(v)
                  ? Object.fromEntries(
                      Object.entries(v).map(([k, x]) => [k, replace(x)]),
                    )
                  : v;
          this.cache = replace(this.cache);
          const updated = this.cache.pending.find(
            (x) => x.op.operationId === item.op.operationId,
          );
          updated.op = prepared;
          updated.preparing = false;
          updated.attempted = true;
          await this.save();
        }
        const queued = this.cache.pending.find(
          (x) => x.op.operationId === item.op.operationId,
        );
        try {
          const {rewardState,...record} = await this.request("POST", queued.op);
          if(rewardState)this.cache.rewards=rewardState;
          if (this.closed) return;
          this.cache.records = this.cache.records
            .filter((r) => r.id !== record.id)
            .concat(record);
          this.cache.pending = this.cache.pending.filter(
            (x) => x.op.operationId !== queued.op.operationId,
          );
          await this.save();
          this.emit();
        } catch (e) {
          if (e.status === 409) {
            queued.conflict = true;
            await this.save();
            await this.pull();
            continue;
          }
          throw e;
        }
      }
      for(const item of [...(this.cache.pendingRewards??[])]){
        if(this.closed||!this.available())break;
        try{
          const rewards=await this.request('REDEEM',item);if(this.closed)return;
          this.cache.rewards=rewards;this.cache.pendingRewards=this.cache.pendingRewards.filter(x=>x.operationId!==item.operationId);this.cache.rewardError=undefined;
          await this.save();this.emit();
        }catch(error){
          if([400,409,422].includes(error.status)){this.cache.pendingRewards=this.cache.pendingRewards.filter(x=>x.operationId!==item.operationId);this.cache.rewardError=error.message;await this.save();this.emit()}
          else throw error;
        }
      }
      this.report(
        this.cache.pending.some((x) => x.conflict)
          ? "conflict"
          : this.cache.pending.length || this.cache.pendingRewards?.length
            ? "offline"
            : "saved",
      );
    } catch (e) {
      if (!this.closed)
        this.report(
          this.storageFailed || this.unread
            ? "storage-full"
            : e.status === 410
              ? "deleted"
              : e.status === 401
                ? "sign-in-required"
                : e.status >= 400 && e.status < 500
                  ? "save-error"
                  : "offline",
        );
    } finally {
      this.running = false;
    }
  }
  redeem(offerId){
    if((this.cache.pendingRewards??[]).some(x=>x.offerId===offerId)||this.cache.rewards?.redemptions.some(x=>x.offerId===offerId))return;
    this.cache.pendingRewards??=[];this.cache.rewardError=undefined;
    this.cache.pendingRewards.push({operationId:this.uuid(),offerId});
    void this.save().then(()=>{this.emit();void this.flush()}).catch(()=>{});this.emit();
  }
  async resolve(choice) {
    if (this.running) throw new Error("Wait for the current save to finish.");
    await this.pull();
    const conflict = this.cache.pending.find((x) => x.conflict);
    if (!conflict) return;
    const id = conflict.op.outingId,
      desired = this.view().find((r) => r.id === id),
      remote = this.cache.records.find((r) => r.id === id);
    this.cache.pending = this.cache.pending.filter((x) => x.op.outingId !== id);
    if (choice === "local" && desired) {
      if (remote && ["completed", "abandoned"].includes(remote.status)) {
        desired.status = remote.status;
        desired.chapter = remote.chapter;
        desired.story = {
          ...desired.story,
          status: remote.status === "completed" ? "done" : remote.story.status,
          outingPhase: remote.status,
        };
      }
      const changes = remote ? diffOuting(plain(remote), plain(desired)) : [];
      if (!remote || changes.length)
        this.cache.pending.push({
          op: remote
            ? { kind: "patch", operationId: this.uuid(), outingId: id, changes }
            : {
                kind: "create",
                operationId: this.uuid(),
                outingId: id,
                record: plain(desired),
              },
        });
    }
    await this.save();
    this.emit();
    await this.flush();
  }
  close() {
    this.closed = true;
    clearTimeout(this.timer);
  }
}
