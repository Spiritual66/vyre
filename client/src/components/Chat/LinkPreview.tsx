import { useEffect, useState } from 'react';
import api from '../../api/axios';

interface Preview {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
}

// Module-level cache so a URL is only fetched once per session.
const cache = new Map<string, Preview | null>();

export default function LinkPreview({ url }: { url: string }) {
  const [data, setData] = useState<Preview | null>(() => cache.get(url) ?? null);
  const [done, setDone] = useState(cache.has(url));

  useEffect(() => {
    if (cache.has(url)) { setData(cache.get(url) ?? null); setDone(true); return; }
    let active = true;
    api.get(`/link-preview?url=${encodeURIComponent(url)}`)
      .then(({ data }) => {
        const p: Preview | null = data && data.title ? data : null;
        cache.set(url, p);
        if (active) { setData(p); setDone(true); }
      })
      .catch(() => { cache.set(url, null); if (active) { setData(null); setDone(true); } });
    return () => { active = false; };
  }, [url]);

  if (!done || !data || !data.title) return null;

  return (
    <a href={data.url} target="_blank" rel="noopener noreferrer"
      className="mt-1.5 flex rounded-lg overflow-hidden border no-underline"
      style={{ borderColor: 'var(--separator)', background: 'var(--hover)', maxWidth: 320 }}>
      {data.image && (
        <img src={data.image} alt="" className="w-20 h-20 object-cover shrink-0"
          onError={e => { e.currentTarget.style.display = 'none'; }} />
      )}
      <div className="p-2 min-w-0">
        {data.siteName && (
          <p className="text-[10px] uppercase tracking-wide truncate" style={{ color: 'var(--text-tertiary)' }}>{data.siteName}</p>
        )}
        <p className="text-xs font-semibold line-clamp-2" style={{ color: 'var(--text-primary)' }}>{data.title}</p>
        {data.description && (
          <p className="text-[11px] line-clamp-2 mt-0.5" style={{ color: 'var(--text-secondary)' }}>{data.description}</p>
        )}
      </div>
    </a>
  );
}
