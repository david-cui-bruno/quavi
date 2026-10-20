import { useEffect, useState } from "react";
import { api } from "./cloud";
import { useRuntime } from "./runtime";
import { useStore } from "./store";
import type { Chapter } from "./data";
export type Picture = {
  url: string;
  placeName: string;
  mapsUrl: string;
  flagUrl?: string;
  authors: { name: string; url?: string; avatar?: string }[];
};

export type VenueIdentity = Pick<Chapter,"place"|"ll"|"kind"|"googlePlaceId"|"aliases">;
/** Provider imagery is held only by the mounted account session. */
export function useVenuePhoto(chapter: VenueIdentity, own?: string) {
  const { account } = useStore(),
    life = useRuntime();
  const [result, setResult] = useState<{
    key: string;
    photo: Picture | null;
    error?: boolean;
  } | null>(null);
  const [retry, setRetry] = useState(0);
  const key = JSON.stringify([
    account?.uid,
    chapter.place,
    chapter.ll?.lat,
    chapter.ll?.lng,
    chapter.googlePlaceId,
    chapter.kind,
    chapter.aliases,
  ]);
  useEffect(() => {
    if (own || !account || !chapter.ll || !life.active || !life.online) {
      setResult(null);
      return;
    }
    const ac = new AbortController();
    setResult(null);
    void api<{ photo: Picture | null }>(
      account,
      "/venue-photo",
      "POST",
      {
        name: chapter.place,
        ll: chapter.ll,
        googlePlaceId: chapter.googlePlaceId,
        kind: chapter.kind,
        aliases: chapter.aliases,
      },
      ac.signal,
    )
      .then((r) => {
        if (!ac.signal.aborted) setResult({ key, photo: r.photo });
      })
      .catch(() => {
        if (!ac.signal.aborted) setResult({ key, photo: null, error: true });
      });
    return () => ac.abort();
    // Primitive identity prevents unrelated outing autosaves from causing paid requests.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, own, life.active, life.online, life.epoch, retry]);
  const photo =
    life.active && life.online && result?.key === key ? result.photo : null;
  const loading =
    !!account &&
    !!chapter.ll &&
    !own &&
    life.online &&
    life.active &&
    result?.key !== key;
  return {photo, loading, online: life.online, error: result?.key === key && result.error, retry: () => setRetry(n=>n+1), canRetry: !!account && !!chapter.ll && life.online && !loading,
    imageFailed: () => setResult({key,photo:null,error:true})};
}
