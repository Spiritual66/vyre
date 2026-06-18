import { useState } from 'react';

interface LocationData {
  lat: number;
  lng: number;
  address: string;
  label?: string;
}

interface Props {
  content: string;
  isOwn: boolean;
}

function googleMapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

function appleMapsUrl(lat: number, lng: number, label?: string): string {
  const q = label ? encodeURIComponent(label) : `${lat},${lng}`;
  return `https://maps.apple.com/?q=${q}&ll=${lat},${lng}&z=15`;
}

function googleEmbedUrl(lat: number, lng: number): string {
  return `https://maps.google.com/maps?q=${lat},${lng}&z=15&output=embed&hl=en`;
}

export default function LocationMessage({ content, isOwn }: Props) {
  const [copied, setCopied] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);

  let data: LocationData;
  try {
    data = JSON.parse(content);
    if (typeof data.lat !== 'number' || typeof data.lng !== 'number') throw new Error();
  } catch {
    return (
      <span className="text-sm italic" style={{ color: 'var(--text-tertiary)' }}>
        Invalid location
      </span>
    );
  }

  const { lat, lng, address, label } = data;
  const placeName = label || address.split(',')[0];
  const coordStr = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;

  const copyCoords = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(coordStr).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };

  return (
    <div className="rounded-lg overflow-hidden" style={{ width: 270 }}>
      {/* Google Maps embed */}
      <div className="relative overflow-hidden" style={{ height: 165 }}>
        {/* Loading skeleton */}
        {!mapLoaded && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2"
            style={{ background: 'var(--hover)' }}>
            <div className="w-10 h-10 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(0,168,132,0.12)' }}>
              <svg viewBox="0 0 24 24" className="w-5 h-5" fill="var(--accent)">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
              </svg>
            </div>
            <p className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>Loading map…</p>
          </div>
        )}
        <iframe
          src={googleEmbedUrl(lat, lng)}
          onLoad={() => setMapLoaded(true)}
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            display: 'block',
            pointerEvents: 'none',
            opacity: mapLoaded ? 1 : 0,
            transition: 'opacity 0.35s ease',
          }}
          title="Location"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
        {/* Click shield so the map doesn't intercept bubble interactions */}
        <div className="absolute inset-0" style={{ pointerEvents: 'none' }} />
      </div>

      {/* Location details card */}
      <div className="px-3 py-2.5" style={{ background: isOwn ? 'rgba(0,0,0,0.06)' : 'rgba(0,0,0,0.03)' }}>
        {/* Place name row */}
        <div className="flex items-start gap-2 mb-1.5">
          <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 shrink-0 mt-0.5" fill="var(--accent)">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
          </svg>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold leading-tight truncate" style={{ color: 'var(--text-primary)' }}>
              {placeName}
            </p>
            <p className="text-[10px] leading-snug mt-0.5 line-clamp-2" style={{ color: 'var(--text-secondary)' }}>
              {address}
            </p>
          </div>
          {/* Copy coords button */}
          <button
            onClick={copyCoords}
            title={copied ? 'Copied!' : 'Copy coordinates'}
            className="shrink-0 p-1 rounded hover:opacity-70 transition-opacity"
            style={{ color: copied ? 'var(--accent)' : 'var(--icon)' }}
          >
            {copied ? (
              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current">
                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current">
                <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
              </svg>
            )}
          </button>
        </div>

        {/* Coordinates */}
        <p className="text-[10px] font-mono mb-2.5" style={{ color: 'var(--text-tertiary)' }}>
          {coordStr}
        </p>

        {/* Open in maps — Google Maps and Apple Maps only */}
        <div className="flex gap-1.5">
          <a
            href={googleMapsUrl(lat, lng)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-[11px] font-semibold transition-opacity hover:opacity-80"
            style={{ background: 'rgba(66,133,244,0.15)', color: '#4285f4' }}
          >
            {/* Google Maps pin icon */}
            <svg viewBox="0 0 24 24" style={{ width: 11, height: 11 }}>
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="#ea4335"/>
              <circle cx="12" cy="9" r="2.5" fill="#fff"/>
            </svg>
            Google Maps
          </a>
          <a
            href={appleMapsUrl(lat, lng, label)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-[11px] font-semibold transition-opacity hover:opacity-80"
            style={{ background: 'rgba(0,0,0,0.07)', color: 'var(--text-secondary)' }}
          >
            {/* Apple logo */}
            <svg viewBox="0 0 24 24" style={{ width: 11, height: 11 }} fill="currentColor">
              <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
            </svg>
            Apple Maps
          </a>
        </div>
      </div>
    </div>
  );
}
