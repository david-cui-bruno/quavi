/** Account-isolated offline cache and optimistic concurrency. Transport is injected for testing. */
export class SyncEngine {
  constructor({ uid, storage, request, prepare, onState, onStatus, initial, sanitize = (value) => value }) {
    Object.assign(this, { storage, request, prepare, onState, onStatus, sanitize })
    this.key = `quavi.account.v1.${uid}`
    this.closed = false; this.running = false; this.conflict = false; this.ready = false
    try { this.cache = JSON.parse(storage.getItem(this.key) || 'null') } catch { /* damaged cache */ }
    if (!this.cache || typeof this.cache.state !== 'object' || !this.cache.state || !Number.isInteger(this.cache.revision) || this.cache.revision < 0 || typeof this.cache.dirty !== 'boolean') this.cache = { state: initial, revision: 0, dirty: false }
  }
  persist() { this.storage.setItem(this.key, JSON.stringify({ ...this.cache, state: this.sanitize(this.cache.state) })) }
  status(value) { if (!this.closed) this.onStatus(value) }
  async open() {
    try {
      const remote = await this.request('GET')
      if (this.closed) return
      if (this.cache.dirty && remote.revision !== this.cache.revision) this.conflict = true
      else if (!this.cache.dirty) this.cache = { state: remote.state || this.cache.state, revision: remote.revision, dirty: false }
      this.persist()
      this.ready = true; this.onState(this.cache.state)
      this.status(this.conflict ? 'conflict' : this.cache.dirty ? 'pending' : this.cache.revision === 0 ? 'empty' : 'saved')
      if (!this.conflict && this.cache.dirty) await this.flush()
    } catch (e) {
      if (this.closed) return
      this.ready = true; this.onState(this.cache.state); this.status(e.status === 410 ? 'deleted' : e.status === 401 ? 'sign-in-required' : e.status >= 400 && e.status < 500 ? 'save-error' : 'offline')
      // Without a successful read, never overwrite an unknown remote revision.
      this.needsRead = true
    }
  }
  edit(state) {
    this.cache = { ...this.cache, state, dirty: true }
    try { this.persist() } catch { this.status('storage-full'); return }
    this.status(this.conflict ? 'conflict' : 'pending')
    clearTimeout(this.timer); this.timer = setTimeout(() => this.flush(), 800)
  }
  async flush() {
    if (this.closed || this.running || !this.ready || this.conflict) return
    if (this.needsRead) { this.needsRead = false; await this.open(); return }
    if (!this.cache.dirty) return
    this.running = true; this.status('saving')
    try {
      while (this.cache.dirty && !this.closed) {
        const snapshot = this.cache.state
        const prepared = await this.prepare(snapshot)
        if (this.closed) return
        const saved = await this.request('PUT', { state: this.sanitize(prepared), revision: this.cache.revision })
        if (this.closed) return
        const unchanged = snapshot === this.cache.state
        this.cache = { state: unchanged ? prepared : this.cache.state, revision: saved.revision, dirty: !unchanged }
        this.persist()
        if (unchanged) this.onState(prepared)
      }
      this.status('saved')
    } catch (e) {
      if (e.status === 409) this.conflict = true
      this.status(this.conflict ? 'conflict' : e.status === 410 ? 'deleted' : e.status === 401 ? 'sign-in-required' : e.status >= 400 && e.status < 500 ? 'save-error' : 'offline')
    } finally { this.running = false }
  }
  async useCloud() {
    if (this.running || this.closed) return
    const remote = await this.request('GET')
    if (this.closed) return
    if (!remote.state) throw new Error('No cloud save to load yet.')
    const next = { state: remote.state, revision: remote.revision, dirty: false }
    this.storage.setItem(this.key, JSON.stringify({...next,state:this.sanitize(next.state)}))
    this.cache = next
    this.conflict = false; this.needsRead = false; this.persist(); this.onState(remote.state); this.status('saved')
  }
  close() { this.closed = true; clearTimeout(this.timer) }
}
