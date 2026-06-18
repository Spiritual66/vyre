interface AvatarProps {
  src?: string | null;
  name?: string;
  size?: number;
  online?: boolean;
  className?: string;
}

const COLORS = [
  '#e74c3c','#e67e22','#f1c40f','#2ecc71','#1abc9c',
  '#3498db','#9b59b6','#e91e63','#00bcd4','#009688',
];

function getColor(name?: string) {
  if (!name) return '#8696a0';
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return COLORS[Math.abs(hash) % COLORS.length];
}

export default function Avatar({ src, name, size = 40, online, className = '' }: AvatarProps) {
  const initials = name ? name.slice(0, 2).toUpperCase() : '?';
  const bg = getColor(name);
  const style = { width: size, height: size, minWidth: size, fontSize: size * 0.38 };

  return (
    <div className={`relative inline-flex ${className}`} style={{ width: size, height: size }}>
      {src ? (
        <img
          src={src}
          alt={name}
          style={style}
          className="rounded-full object-cover"
          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
      ) : (
        <div
          style={{ ...style, backgroundColor: bg }}
          className="rounded-full avatar-placeholder"
        >
          {initials}
        </div>
      )}
      {online !== undefined && (
        <span
          className={`absolute bottom-0 right-0 rounded-full border-2 border-white ${online ? 'bg-wa-green-light' : 'bg-gray-300'}`}
          style={{ width: size * 0.28, height: size * 0.28 }}
        />
      )}
    </div>
  );
}
