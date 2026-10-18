import type { AppState } from './store'
export type SyncStatus = 'empty' | 'saved' | 'pending' | 'saving' | 'conflict' | 'offline' | 'storage-full' | 'sign-in-required'
export class SyncEngine {
  constructor(options: { uid: string; storage: Storage; request: (method: string, body?: unknown) => Promise<{ state: AppState | null; revision: number }>; prepare: (state: AppState) => Promise<unknown>; onState: (state: AppState) => void; onStatus: (status: SyncStatus) => void; initial: AppState })
  cache: { state: AppState; revision: number; dirty: boolean }
  edit(state: AppState): void
  open(): Promise<void>
  flush(): Promise<void>
  useCloud(): Promise<void>
  close(): void
}
