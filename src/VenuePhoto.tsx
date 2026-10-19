import { useState } from "react";
import { Photo } from "./CloudPhoto";
import { VenuePlaceholder } from "./VenuePlaceholder";
import { Btn, Sheet } from "./ui";
import type { Chapter } from "./data";
import { useVenuePhoto, type Picture } from "./venue-photos";
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
  const {photo,loading,error,retry,canRetry,imageFailed,online}=useVenuePhoto(chapter,own);
  const [open,setOpen]=useState(false);
  return (
    <>
      <button
        className="completion-place-image"
        disabled={!own && !photo && !canRetry}
        aria-label={
          own
            ? `View your photo of ${chapter.place}`
            : photo
              ? `View venue photo of ${chapter.place}`
              : `${loading ? "Loading venue photo" : canRetry ? "Retry venue photo; illustrated placeholder" : "Venue illustration"}: ${chapter.place}`
        }
        onClick={() =>
          own ? onOwnPhoto() : photo ? setOpen(true) : retry()
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
            onError={() => imageFailed()}
          />
        ) : (
          <div className="completion-place-empty">
            <VenuePlaceholder kind={chapter.kind} />
            <span>
              {loading
                ? "Finding photo…"
                : !online
                  ? "Photo needs internet"
                  : error
                    ? "Retry photo"
                    : chapter.kind ?? "Your stop"}
            </span>
          </div>
        )}
        <span className="completion-stop-number">{number}</span>
      </button>
      {open && photo && <VenuePhotoSheet photo={photo} onClose={()=>setOpen(false)}/>}

    </>
  );
}

export function VenuePhotoSheet({photo,onClose}:{photo:Picture;onClose:()=>void}) {
  return (
        <Sheet
          label={`Venue photo: ${photo.placeName}`}
          onClose={() => onClose()}
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
          <Btn kind="soft" onClick={() => onClose()}>
            Done
          </Btn>
        </Sheet>);
}
