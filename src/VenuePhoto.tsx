import { useEffect, useState } from "react";
import { api } from "./cloud";
import { useRuntime } from "./runtime";
import { useStore } from "./store";
import { Photo } from "./CloudPhoto";
import { VenuePlaceholder } from "./VenuePlaceholder";
import { Btn, Sheet } from "./ui";
import type { Chapter } from "./data";
type Picture = {
  url: string;
  placeName: string;
  mapsUrl: string;
  flagUrl?: string;
  authors: { name: string; url?: string; avatar?: string }[];
};
/** Venue images are session-only provider content; they never enter saved outings or photo uploads. */
export function VenuePhoto({
  chapter,
  number,
  own,
  onOwnPhoto,
  onProviderPhoto,
}: {
  chapter: Chapter;
  number: number;
  own?: string;
  onOwnPhoto: () => void;
  onProviderPhoto?: () => void;
}) {
  const { account } = useStore(),
    life = useRuntime();
  const [result, setResult] = useState<{
    key: string;
    photo: Picture | null;
    error?: boolean;
  } | null>(null);
  const [open, setOpen] = useState(false),
    [retry, setRetry] = useState(0);
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
    setOpen(false);
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
  return (
    <>
      <button
        className="completion-place-image"
        disabled={!own && !photo && (loading || !account || !chapter.ll || !life.online)}
        aria-label={
          own
            ? `View your photo of ${chapter.place}`
            : photo
              ? `View venue photo of ${chapter.place}`
              : `${loading ? "Loading venue photo" : account && life.online ? "Retry venue photo; illustrated placeholder" : "Venue illustration"}: ${chapter.place}`
        }
        onClick={() =>
          own ? onOwnPhoto() : photo ? setOpen(true) : setRetry((n) => n + 1)
        }
      >
        {own ? (
          <Photo
            src={own}
            alt={chapter.place}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : photo ? (
          <img
            src={photo.url}
            onLoad={onProviderPhoto}
            alt={photo.placeName}
            referrerPolicy="no-referrer"
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            onError={() => setResult({ key, photo: null, error: true })}
          />
        ) : (
          <div className="completion-place-empty">
            <VenuePlaceholder kind={chapter.kind} />
            <span>
              {loading
                ? "Finding photo…"
                : !life.online
                  ? "Photo needs internet"
                  : result?.error
                    ? "Retry photo"
                    : chapter.kind ?? "Your stop"}
            </span>
          </div>
        )}
        <span className="completion-stop-number">{number}</span>
      </button>
      {open && photo && (
        <Sheet
          label={`Venue photo: ${chapter.place}`}
          onClose={() => setOpen(false)}
        >
          <h2 className="h1 h-s">{photo.placeName}</h2>
          <img
            className="venue-photo-large"
            src={photo.url}
            alt={photo.placeName}
          />
          <div className="venue-photo-credits">
            <img src="/google-maps-dark.svg" alt="Google Maps" height="18" />
            {photo.authors.map((a, i) => (
              <div className="row" key={i}>
                {a.avatar && (
                  <img src={a.avatar} alt="" width="28" height="28" />
                )}
                {a.url ? (
                  <a href={a.url} target="_blank" rel="noreferrer">
                    Photo: {a.name}
                  </a>
                ) : (
                  <span>Photo: {a.name}</span>
                )}
              </div>
            ))}
            <a href={photo.mapsUrl} target="_blank" rel="noreferrer">
              View this photo on Google Maps
            </a>
            {photo.flagUrl && (
              <a href={photo.flagUrl} target="_blank" rel="noreferrer">
                Report a photo issue
              </a>
            )}
          </div>
          <Btn kind="soft" onClick={() => setOpen(false)}>
            Done
          </Btn>
        </Sheet>
      )}
    </>
  );
}
