import type { AppState } from './store'
export type SyncStatus = 'deleted' | 'save-error' | 'empty' | 'saved' | 'pending' | 'saving' | 'conflict' | 'offline' | 'storage-full' | 'sign-in-required'
export class SyncEngine {
  constructor(options: { uid: string; storage: Storage; request: (method: string, body?: unknown) => Promise<{ state: AppState | null; revision: number }>; prepare: (state: AppState) => Promise<unknown>; onState: (state: AppState) => void; onStatus: (status: SyncStatus) => void; initial: AppState; available?:()=>boolean; sanitize?: (state:AppState)=>AppState })
  readonly key: string
  needsRead?: boolean
  cache: { state: AppState; revision: number; dirty: boolean }
  edit(state: AppState): void
  resume(): Promise<void>
  open(): Promise<void>
  flush(): Promise<void>
  useCloud(): Promise<void>
  close(): void
}
