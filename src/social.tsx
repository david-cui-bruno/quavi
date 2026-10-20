import { restorePush } from "./push";
import { PushNotifications } from "@capacitor/push-notifications";
import { Capacitor } from "@capacitor/core";
import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api, clearPhotoCache } from "./cloud";
import { useStore } from "./store";
import { useRuntime, runtime } from "./runtime";
import type { Story } from "./data";
export type Person = { id: string; handle: string; name: string };
export type CircleEntry = {
  id: string;
  title: string;
  date: string;
  chapters: { place: string }[];
  author: string;
  ownerId: string;
  handle: string;
  outingId?: string;
};
export type SocialState = {
  me: Person;
  friends: Person[];
  incoming: Person[];
  outgoing: Person[];
  blocked: Person[];
  feed: CircleEntry[];
  notificationsUnread?: number;
  canModerate?: boolean;
  feedCursor?: string | null;
  myPosts: { id: string; outingId: string }[];
};
export type PrivatePost = { story: Story; owner: Person; mine: boolean };
type Context = {
  data: SocialState | null;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
  command: (path: string, method: string, body?: unknown) => Promise<unknown>;
  loadMore: () => Promise<void>;
  publish: (outingId: string) => Promise<void>;
  unpublish: (postId: string) => Promise<void>;
};
const Ctx = createContext<Context>(null!);
export const useSocial = () => useContext(Ctx);
export function SocialProvider({ children }: { children: ReactNode }) {
  const { account, route, saveForSharing, go } = useStore(),
    life = useRuntime();
  const [state, setState] = useState<{
    uid: string;
    data: SocialState | null;
    error: string;
    loading: boolean;
  }>({ uid: "", data: null, error: "", loading: false });
  useEffect(() => {
    void restorePush(account?.uid).catch(() => {});
  }, [account?.uid]);
  const generation = useRef(0),
    sequence = useRef(0);
  const refresh = useCallback(async () => {
    if (!account || !runtime.get().online || !runtime.get().active) return;
    const gen = generation.current,
      ticket = ++sequence.current;
    setState((old) => ({
      uid: account.uid,
      data: old.uid === account.uid ? old.data : null,
      error: "",
      loading: true,
    }));
    try {
      const data = await api<SocialState>(account, "/social");
      if (gen === generation.current && ticket === sequence.current)
        setState({ uid: account.uid, data, error: "", loading: false });
    } catch (e) {
      if (gen === generation.current && ticket === sequence.current) {
        clearPhotoCache();
        setState({
          uid: account.uid,
          data: null,
          error:
            e instanceof Error ? e.message : "Circle unavailable. Try again.",
          loading: false,
        });
      }
    }
  }, [account]);
  useEffect(() => {
    if (!account || Capacitor.getPlatform() !== "ios") return;
    let closed = false;
    let handle: { remove: () => Promise<void> } | undefined;
    void PushNotifications.addListener(
      "pushNotificationActionPerformed",
      () => {
        if (!closed) {
          go("notifications");
          void refresh();
        }
      },
    ).then((h) => {
      if (closed) void h.remove();
      else handle = h;
    });
    return () => {
      closed = true;
      void handle?.remove();
    };
  }, [account, go, refresh]);
  useEffect(() => {
    generation.current++;
    sequence.current++;
    clearPhotoCache();
    setState({
      uid: account?.uid ?? "",
      data: null,
      error: "",
      loading: false,
    });
    if (account && life.active && life.online) void refresh();
    return () => {
      generation.current++;
      sequence.current++;
    };
  }, [account, life.active, life.online, refresh]);
  useEffect(() => {
    if (account && life.active && life.online) {
      void refresh();
      const timer = window.setInterval(() => void refresh(), 30000);
      return () => window.clearInterval(timer);
    }
  }, [account, route.name, life.active, life.online, refresh]);
  const command = useCallback(
    async (path: string, method: string, body?: unknown) => {
      if (!account || !runtime.get().active || !runtime.get().online)
        throw new Error("Connect to update your circle. Nothing was sent.");
      const gen = generation.current;
      sequence.current++;
      const result = await api<
        SocialState | { received: boolean } | { people: Person[] }
      >(account, "/social" + path, method, body);
      if (gen !== generation.current)
        throw new Error("Your session changed. Open your circle again.");
      if ("me" in result) {
        clearPhotoCache();
        setState((old) => ({
          uid: account.uid,
          data: {
            ...result,
            canModerate:
              old.uid === account.uid ? old.data?.canModerate : false,
          },
          error: "",
          loading: false,
        }));
      }
      return result;
    },
    [account],
  );
  const loadMore = async () => {
    const cursor = state.data?.feedCursor;
    if (!account || !cursor || !runtime.get().online) return;
    const gen = generation.current,
      ticket = ++sequence.current;
    const page = await api<{ feed: CircleEntry[]; nextCursor: string | null }>(
      account,
      "/social/feed?cursor=" + encodeURIComponent(cursor),
    );
    if (gen !== generation.current || ticket !== sequence.current) return;
    setState((old) =>
      old.uid !== account.uid || !old.data
        ? old
        : {
            ...old,
            data: {
              ...old.data,
              feed: [
                ...new Map(
                  [...old.data.feed, ...page.feed].map((p) => [p.id, p]),
                ).values(),
              ],
              feedCursor: page.nextCursor,
            },
          },
    );
  };
  const publish = async (outingId: string) => {
    await saveForSharing();
    await command("/posts", "POST", { outingId });
  };
  const unpublish = async (postId: string) => {
    await command("/posts/" + postId, "DELETE");
  };
  const data =
    account && life.online && life.active && state.uid === account.uid
      ? state.data
      : null;
  return (
    <Ctx.Provider
      value={{
        data,
        loading: state.loading,
        error: !life.online
          ? "Connect to see your private circle."
          : state.error,
        refresh,
        command,
        loadMore,
        publish,
        unpublish,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
