import type { AppState } from "./store";
import type { SyncStatus } from "./sync-engine.mjs";
export type OutingStatus = SyncStatus;
export type OutingStorage = {
  read: (uid: string) => Promise<any>;
  write: (uid: string, value: any) => Promise<void>;
  remove: (uid: string) => Promise<void>;
};
export function outingStorage(): OutingStorage;
export function profileOnly(state: AppState): AppState;
export function extractOutings(state: AppState): any[];
export function diffOuting(before: any, after: any, path?: string[]): any[];
export class OutingSync {
  constructor(options: {
    uid: string;
    storage: OutingStorage;
    request: (method: string, body?: any) => Promise<any>;
    prepare?: (value: any) => Promise<any>;
    available?: () => boolean;
    onChange?: () => void;
    onStatus?: (status: OutingStatus) => void;
    uuid?: () => string;
  });
  cache:any;
  redeem(offerId:string):void;
  loaded: boolean;
  status: OutingStatus;
  open(legacy: AppState, dirty?: boolean): Promise<void>;
  project(profile: AppState): AppState;
  edit(before: AppState, next: AppState): void;
  flush(): Promise<void>;
  resolve(choice: "cloud" | "local"): Promise<void>;
  close(): void;
}
