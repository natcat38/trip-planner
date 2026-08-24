'use client';

/**
 * Shared presentational components used across trip pages: currently the
 * Mapbox pin map that plots an itinerary's geocoded activity places.
 * @packageDocumentation
 */

import { useEffect, useRef } from 'react';
import type { Map as MapboxMap, Marker } from 'mapbox-gl';
import { useIsOffline } from '@/lib/useIsOffline';

export interface MapPin {
  id: string;
  lat: number;
  lng: number;
  title: string;
  // Optional per-pin colour override (e.g. a hex like "#e11d48"). Falls back
  // to the default/selected colours below when absent — Map.tsx stays a dumb
  // pins-in, map-out component with no idea what a "custom pin colour"
  // feature even is; validating/interpreting that string is the caller's job.
  color?: string | null;
}

// ADR-0019 §2: converges on the app's one accent token instead of its own
// literal. `el.style.background` is a DOM style value, so the browser
// resolves the CSS custom property at paint time — this is not a Mapbox API
// color option, so var() works here.
const PIN_COLOR = 'var(--accent)';
const SELECTED_PIN_COLOR = '#dc2626';

export function Map({
  pins,
  selectedId,
  onSelectPin,
}: {
  pins: MapPin[];
  selectedId?: string | null;
  onSelectPin?: (id: string) => void;
}) {
  // Map tiles are deliberately not cached for offline use (ADR-0015): Mapbox
  // sets a 12-hour device TTL and GL JS has no supported offline mode. Without
  // this the offline map initialises and renders an empty grey square, which
  // reads as a broken app rather than an unavailable feature.
  const offline = useIsOffline();
  // Public env vars are inlined at build time, so this is a plain constant —
  // safe to read during render on both server and client with no hydration
  // mismatch risk (same as the accessToken assignment below).
  const hasToken = Boolean(process.env.NEXT_PUBLIC_MAPBOX_TOKEN);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const markersRef = useRef(
    new globalThis.Map<string, { marker: Marker; dot: HTMLSpanElement }>(),
  );
  const onSelectPinRef = useRef(onSelectPin);

  useEffect(() => {
    onSelectPinRef.current = onSelectPin;
  });

  const pinsKey = pins
    .map((p) => `${p.id}:${p.lat}:${p.lng}:${p.title}:${p.color ?? ''}`)
    .join('|');

  useEffect(() => {
    if (!containerRef.current || pins.length === 0 || offline || !hasToken)
      return;
    let cancelled = false;
    const markers = markersRef.current;

    (async () => {
      const mapboxgl = (await import('mapbox-gl')).default;
      await import('mapbox-gl/dist/mapbox-gl.css');
      if (cancelled || !containerRef.current) return;

      mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? '';

      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: 'mapbox://styles/mapbox/streets-v12',
        ...(pins.length === 1
          ? { center: [pins[0].lng, pins[0].lat] as [number, number], zoom: 14 }
          : {
              bounds: pins.reduce(
                (bounds, pin) => bounds.extend([pin.lng, pin.lat]),
                new mapboxgl.LngLatBounds(),
              ),
              fitBoundsOptions: { padding: 48, maxZoom: 15 },
            }),
      });
      mapRef.current = map;

      for (const pin of pins) {
        // A real <button>, not a <div>: keyboard-reachable and announced by
        // name to assistive tech. The button itself is the >=24px hit area;
        // the visual 16px dot is a separate aria-hidden child so the pin's
        // apparent size on the map is unchanged. Mapbox centers the marker
        // element on the coordinate using its own offsetWidth/offsetHeight
        // (see .mapboxgl-marker in mapbox-gl.css, which only sets
        // position/opacity — it doesn't impose a size), so the 24px button
        // being centered puts the 16px dot's center on the same coordinate
        // the 16px div used to occupy.
        const el = document.createElement('button');
        el.type = 'button';
        el.setAttribute('aria-label', pin.title);
        el.style.display = 'flex';
        el.style.alignItems = 'center';
        el.style.justifyContent = 'center';
        el.style.width = '24px';
        el.style.height = '24px';
        el.style.padding = '0';
        el.style.border = 'none';
        el.style.background = 'transparent';
        el.style.cursor = 'pointer';

        const dot = document.createElement('span');
        dot.setAttribute('aria-hidden', 'true');
        dot.style.width = '16px';
        dot.style.height = '16px';
        dot.style.borderRadius = '50%';
        dot.style.border = '2px solid white';
        dot.style.boxShadow = '0 1px 3px rgba(0,0,0,0.4)';
        dot.style.background =
          pin.id === selectedId ? SELECTED_PIN_COLOR : (pin.color ?? PIN_COLOR);
        el.appendChild(dot);

        el.addEventListener('click', () => onSelectPinRef.current?.(pin.id));

        const marker = new mapboxgl.Marker({ element: el })
          .setLngLat([pin.lng, pin.lat])
          .setPopup(new mapboxgl.Popup({ offset: 12 }).setText(pin.title))
          .addTo(map);
        markers.set(pin.id, { marker, dot });
      }
    })();

    return () => {
      cancelled = true;
      markers.forEach(({ marker }) => marker.remove());
      markers.clear();
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // pinsKey is the intentional dependency — re-init only when the pin set itself changes.
    // `offline` joins it so reconnecting builds the map that was skipped.
    // `hasToken` is a build-time constant (see its declaration above) and
    // deliberately omitted — it can't change between renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinsKey, offline]);

  useEffect(() => {
    markersRef.current.forEach(({ dot }, id) => {
      const pin = pins.find((p) => p.id === id);
      dot.style.background =
        id === selectedId ? SELECTED_PIN_COLOR : (pin?.color ?? PIN_COLOR);
    });
    const pin = pins.find((p) => p.id === selectedId);
    if (pin) {
      // matchMedia is browser-only; this effect only ever runs on the
      // client, but guard it anyway since it's cheap and removes any doubt.
      const reducedMotion =
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      mapRef.current?.flyTo({
        center: [pin.lng, pin.lat],
        zoom: 15,
        duration: reducedMotion ? 0 : undefined,
      });
    }
    // pinsKey (not pins) avoids re-running on every parent re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, pinsKey]);

  if (pins.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
        No geocoded places yet — add a place to an activity to see it on the
        map.
      </div>
    );
  }

  if (offline) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
        The map needs a connection. Your itinerary below is available offline.
      </div>
    );
  }

  if (!hasToken) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
        Map unavailable — no Mapbox token configured.
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      role="region"
      aria-label="Map of itinerary places"
      // overflow-hidden: the Mapbox canvas paints its own square corners
      // over rounded-lg otherwise.
      className="h-80 w-full overflow-hidden rounded-lg"
    />
  );
}
