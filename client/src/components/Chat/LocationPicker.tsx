import { useState, useEffect, useRef, useCallback } from 'react';

interface LocationResult {
  lat: number;
  lng: number;
  address: string;
  label: string;
}

interface Props {
  onConfirm: (loc: LocationResult) => void;
  onClose: () => void;
}

interface NominatimPlace {
  lat: string;
  lon: string;
  display_name: string;
  name?: string;
  address?: {
    road?: string;
    city?: string;
    town?: string;
    village?: string;
    state?: string;
    country?: string;
    suburb?: string;
    house_number?: string;
  };
}

function buildShortAddress(place: NominatimPlace): string {
  const a = place.address || {};
  const parts: string[] = [];
  if (a.road) parts.push(a.house_number ? `${a.house_number} ${a.road}` : a.road);
  const city = a.city || a.town || a.village || a.suburb;
  if (city) parts.push(city);
  if (a.country) parts.push(a.country);
  return parts.length ? parts.join(', ') : place.display_name.split(',').slice(0, 3).join(',').trim();
}

function googleEmbedUrl(lat: number, lng: number, zoom = 15): string {
  return `https://maps.google.com/maps?q=${lat},${lng}&z=${zoom}&output=embed&hl=en`;
}

function googleMapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

function appleMapsUrl(lat: number, lng: number, label?: string): string {
  const q = label ? encodeURIComponent(label) : `${lat},${lng}`;
  return `https://maps.apple.com/?q=${q}&ll=${lat},${lng}&z=15`;
}

export default function LocationPicker({ onConfirm, onClose }: Props) {
  const [tab, setTab] = useState<'current' | 'search'>('current');

  // Current-location state
  const [gpsState, setGpsState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [gpsResult, setGpsResult] = useState<LocationResult | null>(null);
  const [gpsError, setGpsError] = useState('');
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  // Search state
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<NominatimPlace[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<LocationResult | null>(null);
  const [searchMapLoaded, setSearchMapLoaded] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const fetchGPS = useCallback(() => {
    if (!navigator.geolocation) {
      setGpsError('Geolocation is not supported by your browser.');
      setGpsState('error');
      return;
    }
    setGpsState('loading');
    setGpsResult(null);
    setGpsError('');
    setMapLoaded(false);
    navigator.geolocation.getCurrentPosition(
      async pos => {
        const { latitude: lat, longitude: lng, accuracy } = pos.coords;
        setGpsAccuracy(Math.round(accuracy));
        let address = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
        let label = 'Current Location';
        try {
          const r = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
            { headers: { 'Accept-Language': 'en' } }
          );
          const geo: NominatimPlace = await r.json();
          address = buildShortAddress(geo);
          label = geo.name || geo.address?.road || geo.display_name.split(',')[0];
        } catch {}
        setGpsResult({ lat, lng, address, label });
        setGpsState('done');
      },
      err => {
        setGpsState('error');
        setGpsError(
          err.code === 1
            ? 'Location access denied. Please allow location access in your browser settings.'
            : err.code === 3
            ? 'Location request timed out. Try again.'
            : 'Could not get your location.'
        );
      },
      { timeout: 15000, enableHighAccuracy: true }
    );
  }, []);

  useEffect(() => {
    if (tab === 'current' && gpsState === 'idle') fetchGPS();
  }, [tab, gpsState, fetchGPS]);

  useEffect(() => {
    if (tab === 'search') setTimeout(() => searchInputRef.current?.focus(), 100);
  }, [tab]);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const r = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=6&addressdetails=1`,
        { headers: { 'Accept-Language': 'en' } }
      );
      const places: NominatimPlace[] = await r.json();
      setSearchResults(places);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    clearTimeout(searchTimer.current);
    if (!query.trim()) { setSearchResults([]); return; }
    searchTimer.current = setTimeout(() => doSearch(query), 400);
    return () => clearTimeout(searchTimer.current);
  }, [query, doSearch]);

  const selectPlace = (place: NominatimPlace) => {
    const lat = parseFloat(place.lat);
    const lng = parseFloat(place.lon);
    const address = buildShortAddress(place);
    const label = place.name || place.display_name.split(',')[0];
    setSelected({ lat, lng, address, label });
    setSearchMapLoaded(false);
  };

  const activeLocation = tab === 'current' ? gpsResult : selected;

  const handleConfirm = () => {
    if (activeLocation) onConfirm(activeLocation);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(3px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col fade-in"
        style={{ background: 'var(--panel)', maxHeight: '92vh' }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b shrink-0"
          style={{ background: 'var(--header)', borderColor: 'var(--separator)' }}>
          <button onClick={onClose} className="p-1.5 -ml-1 rounded-full hover:opacity-70 transition-opacity" style={{ color: 'var(--icon)' }}>
            <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
          <div className="flex-1">
            <h2 className="font-semibold text-base leading-tight" style={{ color: 'var(--text-primary)' }}>Share Location</h2>
            <p className="text-[11px] leading-tight mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
              Opens in Google Maps or Apple Maps
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b shrink-0" style={{ borderColor: 'var(--separator)' }}>
          {(['current', 'search'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="flex-1 py-3 text-sm font-medium transition-colors relative"
              style={{ color: tab === t ? 'var(--accent)' : 'var(--text-secondary)' }}
            >
              {t === 'current' ? 'Current Location' : 'Search Place'}
              {tab === t && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full" style={{ background: 'var(--accent)' }} />
              )}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {/* ── CURRENT LOCATION TAB ── */}
          {tab === 'current' && (
            <div className="flex flex-col">
              {(gpsState === 'idle' || gpsState === 'loading') && (
                <div className="flex flex-col items-center justify-center py-16 gap-4">
                  <div className="w-16 h-16 rounded-full flex items-center justify-center"
                    style={{ background: 'rgba(0,168,132,0.12)' }}>
                    {gpsState === 'loading' ? (
                      <svg className="animate-spin w-8 h-8" fill="none" viewBox="0 0 24 24" style={{ color: 'var(--accent)' }}>
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" className="w-8 h-8" fill="var(--accent)">
                        <path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3A8.994 8.994 0 0 0 13 3.06V1h-2v2.06A8.994 8.994 0 0 0 3.06 11H1v2h2.06A8.994 8.994 0 0 0 11 20.94V23h2v-2.06A8.994 8.994 0 0 0 20.94 13H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"/>
                      </svg>
                    )}
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      {gpsState === 'loading' ? 'Getting your location…' : 'Tap to get your location'}
                    </p>
                    <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                      Your location is only shared when you tap Send
                    </p>
                  </div>
                  {gpsState === 'idle' && (
                    <button onClick={fetchGPS}
                      className="px-6 py-2.5 rounded-full text-sm font-semibold text-white shadow-sm hover:opacity-90 transition-opacity"
                      style={{ background: 'var(--accent)' }}>
                      Use My Location
                    </button>
                  )}
                </div>
              )}

              {gpsState === 'error' && (
                <div className="flex flex-col items-center justify-center py-12 gap-4 px-6">
                  <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: 'rgba(239,68,68,0.1)' }}>
                    <svg viewBox="0 0 24 24" className="w-8 h-8" fill="#ef4444">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
                    </svg>
                  </div>
                  <p className="text-sm text-center leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{gpsError}</p>
                  <button onClick={fetchGPS}
                    className="px-6 py-2.5 rounded-full text-sm font-semibold text-white shadow-sm hover:opacity-90 transition-opacity"
                    style={{ background: 'var(--accent)' }}>
                    Try Again
                  </button>
                </div>
              )}

              {gpsState === 'done' && gpsResult && (
                <>
                  {/* Google Maps embed */}
                  <div className="relative" style={{ height: 230 }}>
                    {!mapLoaded && (
                      <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'var(--hover)' }}>
                        <svg className="animate-spin w-6 h-6" fill="none" viewBox="0 0 24 24" style={{ color: 'var(--accent)' }}>
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                        </svg>
                      </div>
                    )}
                    <iframe
                      src={googleEmbedUrl(gpsResult.lat, gpsResult.lng)}
                      onLoad={() => setMapLoaded(true)}
                      style={{ width: '100%', height: '100%', border: 'none', display: 'block', opacity: mapLoaded ? 1 : 0, transition: 'opacity 0.3s' }}
                      title="Google Maps preview"
                      loading="lazy"
                      referrerPolicy="no-referrer-when-downgrade"
                      allowFullScreen
                    />
                  </div>

                  {/* Location card */}
                  <div className="px-4 py-3 border-t" style={{ borderColor: 'var(--separator)' }}>
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full shrink-0 flex items-center justify-center mt-0.5"
                        style={{ background: 'rgba(0,168,132,0.12)' }}>
                        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="var(--accent)">
                          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold leading-tight truncate" style={{ color: 'var(--text-primary)' }}>
                          {gpsResult.label}
                        </p>
                        <p className="text-xs mt-0.5 leading-snug line-clamp-2" style={{ color: 'var(--text-secondary)' }}>
                          {gpsResult.address}
                        </p>
                        <div className="flex items-center gap-3 mt-1.5">
                          {gpsAccuracy !== null && (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                              style={{ background: 'rgba(0,168,132,0.1)', color: 'var(--accent)' }}>
                              ±{gpsAccuracy}m
                            </span>
                          )}
                          <span className="text-[10px] font-mono" style={{ color: 'var(--text-tertiary)' }}>
                            {gpsResult.lat.toFixed(6)}, {gpsResult.lng.toFixed(6)}
                          </span>
                        </div>
                      </div>
                      <button onClick={fetchGPS} className="shrink-0 p-2 rounded-full hover:opacity-70 transition-opacity" style={{ color: 'var(--icon)' }} title="Refresh">
                        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
                          <path d="M17.65 6.35A7.958 7.958 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
                        </svg>
                      </button>
                    </div>

                    {/* Preview links */}
                    <div className="flex gap-2 mt-3">
                      <a href={googleMapsUrl(gpsResult.lat, gpsResult.lng)} target="_blank" rel="noopener noreferrer"
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-opacity hover:opacity-80"
                        style={{ background: 'rgba(66,133,244,0.12)', color: '#4285f4' }}>
                        <GoogleMapsIcon />
                        Google Maps
                      </a>
                      <a href={appleMapsUrl(gpsResult.lat, gpsResult.lng, gpsResult.label)} target="_blank" rel="noopener noreferrer"
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-opacity hover:opacity-80"
                        style={{ background: 'rgba(0,0,0,0.06)', color: 'var(--text-secondary)' }}>
                        <AppleMapsIcon />
                        Apple Maps
                      </a>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── SEARCH TAB ── */}
          {tab === 'search' && (
            <div className="flex flex-col">
              {/* Search input */}
              <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--separator)' }}>
                <div className="flex items-center gap-2 rounded-full px-3 py-2.5" style={{ background: 'var(--input-bg)' }}>
                  <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current shrink-0" style={{ color: 'var(--icon)' }}>
                    <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
                  </svg>
                  <input
                    ref={searchInputRef}
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="Search for a city, landmark, address…"
                    className="flex-1 text-sm bg-transparent outline-none"
                    style={{ color: 'var(--text-primary)' }}
                  />
                  {query && (
                    <button onClick={() => { setQuery(''); setSearchResults([]); setSelected(null); }}
                      className="shrink-0 hover:opacity-70 transition-opacity" style={{ color: 'var(--icon)' }}>
                      <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
                        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                      </svg>
                    </button>
                  )}
                </div>
              </div>

              {/* Selected place preview */}
              {selected && (
                <div className="border-b" style={{ borderColor: 'var(--separator)' }}>
                  <div className="relative" style={{ height: 190 }}>
                    {!searchMapLoaded && (
                      <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'var(--hover)' }}>
                        <svg className="animate-spin w-6 h-6" fill="none" viewBox="0 0 24 24" style={{ color: 'var(--accent)' }}>
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                        </svg>
                      </div>
                    )}
                    <iframe
                      src={googleEmbedUrl(selected.lat, selected.lng)}
                      onLoad={() => setSearchMapLoaded(true)}
                      style={{ width: '100%', height: '100%', border: 'none', display: 'block', opacity: searchMapLoaded ? 1 : 0, transition: 'opacity 0.3s' }}
                      title="Selected location"
                      loading="lazy"
                      referrerPolicy="no-referrer-when-downgrade"
                      allowFullScreen
                    />
                  </div>

                  <div className="px-4 py-3">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center mt-0.5"
                        style={{ background: 'rgba(0,168,132,0.12)' }}>
                        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="var(--accent)">
                          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{selected.label}</p>
                        <p className="text-xs mt-0.5 leading-snug line-clamp-2" style={{ color: 'var(--text-secondary)' }}>{selected.address}</p>
                        <p className="text-[10px] mt-1 font-mono" style={{ color: 'var(--text-tertiary)' }}>
                          {selected.lat.toFixed(6)}, {selected.lng.toFixed(6)}
                        </p>
                      </div>
                      <button onClick={() => setSelected(null)}
                        className="shrink-0 p-1.5 rounded-full hover:opacity-70 transition-opacity" style={{ color: 'var(--icon)' }}>
                        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
                          <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                        </svg>
                      </button>
                    </div>

                    {/* Preview links */}
                    <div className="flex gap-2 mt-3">
                      <a href={googleMapsUrl(selected.lat, selected.lng)} target="_blank" rel="noopener noreferrer"
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-opacity hover:opacity-80"
                        style={{ background: 'rgba(66,133,244,0.12)', color: '#4285f4' }}>
                        <GoogleMapsIcon />
                        Google Maps
                      </a>
                      <a href={appleMapsUrl(selected.lat, selected.lng, selected.label)} target="_blank" rel="noopener noreferrer"
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-opacity hover:opacity-80"
                        style={{ background: 'rgba(0,0,0,0.06)', color: 'var(--text-secondary)' }}>
                        <AppleMapsIcon />
                        Apple Maps
                      </a>
                    </div>
                  </div>
                </div>
              )}

              {/* Search results */}
              {searching ? (
                <div className="flex justify-center py-12">
                  <svg className="animate-spin w-6 h-6" fill="none" viewBox="0 0 24 24" style={{ color: 'var(--accent)' }}>
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                </div>
              ) : searchResults.length > 0 ? (
                <div>
                  {searchResults.map((place, i) => {
                    const shortAddr = buildShortAddress(place);
                    const label = place.name || place.display_name.split(',')[0];
                    return (
                      <button
                        key={i}
                        onClick={() => selectPlace(place)}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left transition-opacity hover:opacity-80 border-b"
                        style={{ borderColor: 'var(--separator)' }}
                      >
                        <div className="w-9 h-9 rounded-full shrink-0 flex items-center justify-center"
                          style={{ background: 'rgba(0,168,132,0.1)' }}>
                          <svg viewBox="0 0 24 24" className="w-4.5 h-4.5" fill="var(--accent)" style={{ width: 18, height: 18 }}>
                            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{label}</p>
                          <p className="text-xs truncate mt-0.5" style={{ color: 'var(--text-secondary)' }}>{shortAddr}</p>
                        </div>
                        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current shrink-0" style={{ color: 'var(--separator)' }}>
                          <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/>
                        </svg>
                      </button>
                    );
                  })}
                </div>
              ) : query && !searching ? (
                <div className="flex flex-col items-center justify-center py-14 gap-3">
                  <svg viewBox="0 0 24 24" className="w-12 h-12 opacity-15 fill-current" style={{ color: 'var(--text-secondary)' }}>
                    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                  </svg>
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>No results for "{query}"</p>
                </div>
              ) : !query ? (
                <div className="flex flex-col items-center justify-center py-14 gap-3">
                  <svg viewBox="0 0 24 24" className="w-12 h-12 opacity-15 fill-current" style={{ color: 'var(--text-secondary)' }}>
                    <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
                  </svg>
                  <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Search for a city, landmark, or address</p>
                </div>
              ) : null}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t shrink-0" style={{ borderColor: 'var(--separator)' }}>
          <button
            onClick={handleConfirm}
            disabled={!activeLocation}
            className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-opacity disabled:opacity-40 hover:opacity-90"
            style={{ background: 'var(--accent)' }}
          >
            {activeLocation
              ? `Send — ${activeLocation.label}`
              : tab === 'current' ? 'Waiting for location…' : 'Select a place to send'}
          </button>
        </div>
      </div>
    </div>
  );
}

function GoogleMapsIcon() {
  return (
    <svg viewBox="0 0 24 24" style={{ width: 13, height: 13 }}>
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="#ea4335"/>
      <circle cx="12" cy="9" r="2.5" fill="#fff"/>
    </svg>
  );
}

function AppleMapsIcon() {
  return (
    <svg viewBox="0 0 24 24" style={{ width: 13, height: 13 }} fill="currentColor">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
    </svg>
  );
}
