export default function NexvoraLogo({ size = 32, color = 'var(--accent)' }) {
  // Hexagon vertices (flat-top, centered at 50,50, radius ~36)
  // Top(50,14) TopRight(82,32) BotRight(82,68) Bot(50,86) BotLeft(18,68) TopLeft(18,32)
  // Spikes extend outward from each vertex along the center→vertex direction, 12 units
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Top spike: vertex (50,14) → outward (0,-1) → (50,2) */}
      <line x1="50" y1="14" x2="50" y2="2"   stroke={color} strokeWidth="5" strokeLinecap="round"/>
      {/* Top-right spike: vertex (82,32) → outward (0.872,-0.490) → (93,26) */}
      <line x1="82" y1="32" x2="93" y2="26"  stroke={color} strokeWidth="5" strokeLinecap="round"/>
      {/* Bottom-right spike: vertex (82,68) → outward (0.872,0.490) → (93,74) */}
      <line x1="82" y1="68" x2="93" y2="74"  stroke={color} strokeWidth="5" strokeLinecap="round"/>
      {/* Bottom spike: vertex (50,86) → outward (0,1) → (50,98) */}
      <line x1="50" y1="86" x2="50" y2="98"  stroke={color} strokeWidth="5" strokeLinecap="round"/>
      {/* Bottom-left spike: vertex (18,68) → outward (-0.872,0.490) → (7,74) */}
      <line x1="18" y1="68" x2="7"  y2="74"  stroke={color} strokeWidth="5" strokeLinecap="round"/>
      {/* Top-left spike: vertex (18,32) → outward (-0.872,-0.490) → (7,26) */}
      <line x1="18" y1="32" x2="7"  y2="26"  stroke={color} strokeWidth="5" strokeLinecap="round"/>

      {/* Outer hexagon border */}
      <polygon
        points="50,14 82,32 82,68 50,86 18,68 18,32"
        fill="none"
        stroke={color}
        strokeWidth="7"
        strokeLinejoin="round"
      />

      {/* Inner dark fill */}
      <polygon
        points="50,22 74,36 74,64 50,78 26,64 26,36"
        fill="#0a0a0a"
      />

      {/* Diamond / kite */}
      <polygon
        points="50,30 63,50 50,70 37,50"
        fill={color}
        opacity="0.9"
      />

      {/* Center eye */}
      <circle cx="50" cy="50" r="8" fill="#0a0a0a" />
      <circle cx="50" cy="50" r="4" fill={color} />
    </svg>
  );
}
