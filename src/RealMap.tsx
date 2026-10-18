import {DemoRouteCredit} from './demo-walks'
import { useEffect, useLayoutEffect, useId, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { GoogleMap, LatLngBounds, type Marker, type Polyline } from "@capacitor/google-maps";
import type { AvatarSpec } from "./brand/Persona";
import { distance, type LatLng } from "./geo";
import {useRuntime} from './runtime'
import {mapArt} from "./map-art";
import mapsConfig from "./maps-config.json";
export type PinKind =
  | "quest"
  | "dest"
  | "start"
  | "current"
  | "done"
  | "locked";
export type RealPin = {
  id: string;
  ll: LatLng;
  kind: PinKind;
  label?: string;
  number?: number;
  size?: number;
  offsetX?: number;
  sub?: string;
  selected?: boolean;
  quest?: boolean;
  onClick?: () => void;
};
export type MapCoin = { id: number; ll: LatLng; got: boolean };
// Native map creation/destruction is serialized so React's development remount cannot race SDK views.
let lifecycle: Promise<unknown> = Promise.resolve();
export function RealMap({
  pins,
  route,
  highlightRoute,
  coins,
  fit,
  inset = { top: 180, bottom: 340 },
  you,
  youAvatar,
  follow = false,
  zoomOnYou = 16,
  controlsTop = 176,
  compact = false,
  sampleRoute = false,
}: {
  pins: RealPin[];
  route?: LatLng[];
  highlightRoute?: LatLng[];
  coins?: MapCoin[];
  fit?: LatLng[];
  inset?: { top: number; bottom: number };
  you?: LatLng;
  youAvatar?: AvatarSpec;
  follow?: boolean;
  zoomOnYou?: number;
  controlsTop?: number;
  compact?: boolean;
  sampleRoute?: boolean;
}) {
  const life=useRuntime()
  const element = useRef<HTMLElement>(null),
    id = useId().replace(/[^a-z0-9]/gi, ""),
    latest = useRef({ pins, you, fit, inset, zoomOnYou });
  latest.current = { pins, you, fit, inset, zoomOnYou };
  const [cover, setCover] = useState(0);
  const [headerBottom,setHeaderBottom]=useState(0);
  useLayoutEffect(() => {
    const el = element.current;
    if (!el) return;
    const root = el.closest(".phone") ?? el.closest("main") ?? el.parentElement!;
    const observed = new WeakSet<Element>();
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const observer = new ResizeObserver(schedule);
    const measure = () => {
      if(compact){setCover(0);setHeaderBottom(0);return}
      const panels = [...root.querySelectorAll<HTMLElement>("[data-map-obstruction], .sheet")];
      panels.forEach(p => { if (!observed.has(p)) { observed.add(p); observer.observe(p); } });
      const r = el.parentElement!.getBoundingClientRect();
      const headers=[...root.querySelectorAll<HTMLElement>('[data-map-top-obstruction], .navbanner')];
      headers.forEach(p=>{if(!observed.has(p)){observed.add(p);observer.observe(p)}});
      setHeaderBottom(headers.length?Math.max(0,...headers.map(p=>p.getBoundingClientRect().bottom-r.top))+8:0);
      const tops = panels
        .map((p) => p.getBoundingClientRect())
        .filter(p => p.width > r.width * 0.5 && p.bottom >= r.bottom - 4 && p.top < r.bottom && p.top > r.top);
      setCover(tops.length ? Math.max(0, Math.min(r.height - 120, r.bottom - Math.min(...tops.map(p => p.top)))) : 0);
    };
    observer.observe(el.parentElement!);
    const changes = new MutationObserver(schedule);
    changes.observe(root, { childList: true, subtree: true });
    root.addEventListener("animationend", schedule);
    root.addEventListener("transitionend", schedule);
    measure();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      changes.disconnect();
      root.removeEventListener("animationend", schedule);
      root.removeEventListener("transitionend", schedule);
    };
  }, [compact]);
  const [map, setMap] = useState<GoogleMap | null>(null),
    [error, setError] = useState(""),
    [following, setFollowing] = useState(follow);
  const followRef = useRef(follow),
    zoom = useRef(zoomOnYou),
    clicks = useRef(new Map<string, string>());
  const setFollow = (v: boolean) => {
    followRef.current = v;
    setFollowing(v);
  };
  const mutations = useRef<Promise<unknown>>(Promise.resolve());
  useEffect(() => {
    let canceled = false,
      created: GoogleMap | undefined;
    setMap(null);
    setError("");
    if(!life.active)return
    if(!life.online){setError('You’re offline. Reconnect to load the map.');return}
    lifecycle = lifecycle
      .catch(() => {})
      .then(async () => {
        if (canceled || !element.current) return;
        await Promise.allSettled(
          (element.current.closest("main")?.getAnimations() ?? []).map(
            (animation) => animation.finished,
          ),
        );
        if (canceled || !element.current) return;
        const p = latest.current;
        let resolveReady!: () => void;
        const ready = new Promise<void>((resolve) => {
          resolveReady = resolve;
        });
        const m = await GoogleMap.create(
          {
            id: "quavi-" + id,
            element: element.current,
            apiKey: Capacitor.isNativePlatform()
              ? mapsConfig.iosKey
              : mapsConfig.webKey,
            config: {
              center: p.you ?? p.fit?.[0] ?? { lat: 40.7329, lng: -74.0031 },
              zoom: p.zoomOnYou,
              minZoom: 3,
              maxZoom: 20,
              disableDefaultUI: true,
              clickableIcons: false,
              headingInteractionEnabled: false,
              tiltInteractionEnabled: false,
              gestureHandling: "greedy",
              backgroundColor: "#F7F4EC",
              styles: [
                {featureType:'landscape',stylers:[{color:'#F7F4EC'}]},
                {featureType:'poi',elementType:'labels',stylers:[{visibility:'off'}]},
                {featureType:'transit',elementType:'labels',stylers:[{visibility:'off'}]},
                {featureType:'road',elementType:'labels.icon',stylers:[{visibility:'off'}]},
                {featureType:'poi.park',elementType:'geometry',stylers:[{color:'#DCE6CD'}]},
                {featureType:'water',elementType:'geometry',stylers:[{color:'#C5DDE5'}]},
                {featureType:'road',elementType:'geometry',stylers:[{color:'#FFFFFF'}]},
                {featureType:'road',elementType:'labels.text.fill',stylers:[{color:'#4B4945'}]},
              ],
            },
          },
          () => resolveReady(),
        );
        created = m;
        if (canceled) {
          await m.destroy();
          created = undefined;
          return;
        }
        let timeout: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([
            ready,
            new Promise((_, reject) => {
              timeout = setTimeout(
                () => reject(new Error("Map readiness timed out")),
                10000,
              );
            }),
          ]);
        } finally {
          clearTimeout(timeout);
        }
        if (canceled) {
          await m.destroy();
          created = undefined;
          return;
        }
        if(compact)await m.disableTouch();
        await m.setOnCameraMoveStartedListener((e) => {
          if (e.isGesture) setFollow(false);
        });
        await m.setOnCameraIdleListener((e) => {
          zoom.current = e.zoom;
        });
        await m.setOnMarkerClickListener((e) => {
          const pin = latest.current.pins.find(
            (p) => p.id === clicks.current.get(e.markerId),
          );
          pin?.onClick?.();
        });
        if(Capacitor.isNativePlatform())await m.enableAccessibilityElements(false); // Plugin passes this flag to accessibilityElementsHidden.
        if (!canceled) {
          markers.current = [];
          lines.current = [];
          setMap(m);
        }
      })
      .catch(() => {
        if (!canceled)
          setError(
            "Map unavailable. Check your connection and reopen this screen.",
          );
      });
    return () => {
      canceled = true;
      lifecycle = lifecycle
        .catch(() => {})
        .then(async () => {
          await mutations.current.catch(() => {});
          if (created) await created.destroy();
        });
    };
  }, [id, cover, life.epoch, life.active, life.online, compact]);
  const paddingReady = useRef<Promise<unknown>>(Promise.resolve());
  useEffect(() => {
    if (!map) return;
    const h = element.current?.clientHeight ?? 600;
    const top = compact ? 40 : Math.min(headerBottom || inset.top, Math.max(0,h-100)),
      bottom = compact ? 12 : Math.min(
        cover ? 60 : Math.max(70, inset.bottom),
        Math.max(20,h-top-80),
      );
    paddingReady.current = map.setPadding({ top, bottom, left: 24, right: 24 }).catch(() => {});
  }, [map, inset.top, inset.bottom, cover, headerBottom, compact]);
  const fitKey = (fit ?? []).map((p) => p.lat + "," + p.lng).join("|");
  useEffect(() => {
    if (!map || !fit?.length) return;
    const sw = {
        lat: Math.min(...fit.map((p) => p.lat)),
        lng: Math.min(...fit.map((p) => p.lng)),
      },
      ne = {
        lat: Math.max(...fit.map((p) => p.lat)),
        lng: Math.max(...fit.map((p) => p.lng)),
      };
    const bounds = new LatLngBounds({
      southwest: sw,
      northeast: ne,
      center: { lat: (sw.lat + ne.lat) / 2, lng: (sw.lng + ne.lng) / 2 },
    });
    let canceled=false;
    // Native bridge calls may execute concurrently; fit only after obstruction padding applies.
    void paddingReady.current.then(()=>{if(!canceled)return map.fitBounds(bounds,compact?16:32)}).catch(()=>{});
    return ()=>{canceled=true};
    // Geometry controls framing; array identity changes while walking do not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, fitKey, compact]);
  const markers = useRef<string[]>([]),
    lines = useRef<string[]>([]);
  useEffect(() => {
    if (!map) return;
    let canceled = false;
    mutations.current = mutations.current
      .catch(() => {})
      .then(async () => {
        if (canceled) return;

        clicks.current.clear();
        const list: (Marker & {quavi?:unknown})[] = await Promise.all(pins.map(async (p) => ({
          coordinate: p.ll,
          title: p.number ? `Stop ${p.number}${p.label?`: ${p.label}`:""}` : p.label ?? "",
          snippet: p.sub ?? "",
          ...await mapArt(p),
          zIndex: p.selected ? 10 : p.kind === "current" ? 8 : 2,
        })));
        if (you)
          list.push({
            coordinate: you,
            title: "You",
            ...await mapArt('you',youAvatar),
            zIndex: 20,
          });
        for (const coin of coins ?? [])
          if (!coin.got)
            list.push({
              coordinate: coin.ll,
              title: "Demo coin",
              ...await mapArt('coin'),
              quavi: {...(await mapArt('coin')).quavi,key:'coin-'+coin.id},
            });
        if(canceled)return;
        const ids = list.length ? await map.addMarkers(list) : [];
        const removed=markers.current.filter(id=>!ids.includes(id));
        if(removed.length)await map.removeMarkers(removed);
        markers.current = ids;
        pins.forEach((p, i) => clicks.current.set(ids[i], p.id));
      })
      .catch(() => {
        if (!canceled)
          setError("Couldn’t update the map. Reopen this screen to retry.");
      });
    return () => {
      canceled = true;
    };
  }, [map, pins, route, highlightRoute, coins, you?.lat, you?.lng, youAvatar]);
  const routeKey=JSON.stringify([route,highlightRoute]);
  useEffect(()=>{
    if(!map)return;
    let canceled=false;
    mutations.current=mutations.current.catch(()=>{}).then(async()=>{
      if(canceled)return;
      if(lines.current.length)await map.removePolylines(lines.current);
      lines.current=[];
        const paths: Polyline[] = [];
        if (route && route.length > 1)
          paths.push({
            path: route,
            strokeColor: "#EE6A2C",
            strokeWeight: 5,
            strokeOpacity: 0.75,
          });
        if (highlightRoute && highlightRoute.length > 1)
          paths.push({
            path: highlightRoute,
            strokeColor: "#EE6A2C",
            strokeWeight: 7,
            strokeOpacity: 0.95,
          });
        if (paths.length) lines.current = await map.addPolylines(paths);

    }).catch(()=>{if(!canceled)setError('Couldn’t update the walking route. Reopen this screen to retry.')});
    return()=>{canceled=true};
    // Actual geometry drives path updates, independently of GPS/pin rendering and zoom.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[map,routeKey]);
  useEffect(() => {
    if (map && you && followRef.current)
      void map
        .setCamera({ coordinate: you, zoom: zoom.current, animate: true })
        .catch(() => {});
  }, [map, you?.lat, you?.lng]);
  const recenter = () => {
    if (!map || !you) return;
    setFollow(true);
    void map
      .setCamera({
        coordinate: you,
        zoom: Math.max(zoom.current, zoomOnYou),
        animate: true,
      })
      .catch(() => {});
  };
  return (
    <div
      className="rmap-wrap"
      style={{ ["--ctl-top" as string]: `${controlsTop}px`, ["--map-header-bottom" as string]: `${headerBottom}px`, ["--map-cover" as string]: `${cover}px` }}
    >
      <capacitor-google-map
        ref={element}
        style={{
          display: "block",
          position: "absolute",
          left: 0,
          right: 0,
          top: 0,
          bottom: cover,
          width: "100%",
          height: `calc(100% - ${cover}px)`,
        }}
        aria-label={map ? "Google Maps, ready" : "Google Maps, loading"}
      />
      {error && (
        <p
          role="alert"
          className="card small"
          style={{
            position: "absolute",
            left: 24,
            right: 24,
            top: controlsTop,
            padding: 16,
            zIndex: 5,
          }}
        >
          {error}
        </p>
      )}
      {sampleRoute&&<DemoRouteCredit/>}
      {you && (
        <button
          className={`rmap-locate${following ? " on" : ""}`}
          onClick={recenter}
          aria-label={
            following ? "Following your location" : "Center on my location"
          }
          aria-pressed={following}
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="3.2" fill="currentColor" />
            <circle cx="12" cy="12" r="7.5" />
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
          </svg>
        </button>
      )}
    </div>
  );
}
export function useCoinCollect(
  pos: LatLng,
  coins: MapCoin[],
  onCollect: (id: number) => void,
) {
  useEffect(() => {
    for (const c of coins)
      if (!c.got && distance(pos, c.ll) < 26) onCollect(c.id);
  }, [pos, coins, onCollect]);
}
