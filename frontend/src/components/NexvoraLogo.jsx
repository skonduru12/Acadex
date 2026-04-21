export default function NexvoraLogo({ size = 32, color = 'var(--accent)' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Spike connectors at 6 hexagon vertices */}
      <line x1="50" y1="2"  x2="50" y2="14"  stroke={color} strokeWidth="5" strokeLinecap="round"/>
      <line x1="50" y1="86" x2="50" y2="98"  stroke={color} strokeWidth="5" strokeLinecap="round"/>
      <line x1="8"  y1="26" x2="18" y2="32"  stroke={color} strokeWidth="5" strokeLinecap="round"/>
      <line x1="82" y1="26" x2="92" y2="32"  stroke={color} strokeWidth="5" strokeLinecap="round"/>
      <line x1="8"  y1="74" x2="18" y2="68"  stroke={color} strokeWidth="5" strokeLinecap="round"/>
      <line x1="82" y1="74" x2="92" y2="68"  stroke={color} strokeWidth="5" strokeLinecap="round"/>

      {/* Outer hexagon border */}
      <polygon
        points="50,14 82,32 82,68 50,86 18,68 18,32"
        fill="none"
        stroke={color}
        strokeWidth="7"
        strokeLinejoin="round"
      />

      {/* Inner black fill */}
      <polygon
        points="50,22 74,36 74,64 50,78 26,64 26,36"
        fill="#0a0a0a"
      />

      {/* Diamond / kite shape */}
      <polygon
        points="50,30 63,50 50,70 37,50"
        fill={color}
        opacity="0.9"
      />

      {/* Center circle */}
      <circle cx="50" cy="50" r="8" fill="#0a0a0a" />
      <circle cx="50" cy="50" r="4" fill={color} />
    </svg>
  );
}
