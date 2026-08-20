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

const PIN_COLOR = '#2563eb';
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
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const markersRef = useRef(new globalThis.Map<string, Marker>());
  const onSelectPinRef = useRef(onSelectPin);

  useEffect(() => {
    onSelectPinRef.current = onSelectPin;
  });

  const pinsKey = pins
    .map((p) => `${p.id}:${p.lat}:${p.lng}:${p.title}:${p.color ?? ''}`)
    .join('|');

  useEffect(() => {
    if (!containerRef.current || pins.length === 0 || offline) return;
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
        const el = document.createElement('div');
        el.style.width = '16px';
        el.style.height = '16px';
        el.style.borderRadius = '50%';
        el.style.border = '2px solid white';
        el.style.boxShadow = '0 1px 3px rgba(0,0,0,0.4)';
        el.style.cursor = 'pointer';
        el.style.background =
          pin.id === selectedId ? SELECTED_PIN_COLOR : (pin.color ?? PIN_COLOR);
        el.addEventListener('click', () => onSelectPinRef.current?.(pin.id));

        const marker = new mapboxgl.Marker({ element: el })
          .setLngLat([pin.lng, pin.lat])
          .setPopup(new mapboxgl.Popup({ offset: 12 }).setText(pin.title))
          .addTo(map);
        markers.set(pin.id, marker);
      }
    })();

    return () => {
      cancelled = true;
      markers.forEach((marker) => marker.remove());
      markers.clear();
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // pinsKey is the intentional dependency — re-init only when the pin set itself changes.
    // `offline` joins it so reconnecting builds the map that was skipped.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinsKey, offline]);

  useEffect(() => {
    markersRef.current.forEach((marker, id) => {
      const pin = pins.find((p) => p.id === id);
      marker.getElement().style.background =
        id === selectedId ? SELECTED_PIN_COLOR : (pin?.color ?? PIN_COLOR);
    });
    const pin = pins.find((p) => p.id === selectedId);
    if (pin) mapRef.current?.flyTo({ center: [pin.lng, pin.lat], zoom: 15 });
    // pinsKey (not pins) avoids re-running on every parent re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, pinsKey]);

  if (pins.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-black/[.08] p-8 text-center text-sm text-zinc-500 dark:border-white/[.145] dark:text-zinc-400">
        No geocoded places yet — add a place to an activity to see it on the
        map.
      </div>
    );
  }

  if (offline) {
    return (
      <div className="rounded-lg border border-dashed border-black/[.08] p-8 text-center text-sm text-zinc-500 dark:border-white/[.145] dark:text-zinc-400">
        The map needs a connection. Your itinerary below is available offline.
      </div>
    );
  }

  return <div ref={containerRef} className="h-80 w-full rounded-lg" />;
}
