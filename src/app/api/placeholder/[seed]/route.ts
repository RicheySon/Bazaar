import { NextRequest, NextResponse } from 'next/server';

// Generate a deterministic SVG placeholder based on the seed
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ seed: string }> }
) {
  const { seed } = await params;

  // Generate colors from seed
  const hash = simpleHash(seed);
  const hue1 = hash % 360;
  const hue2 = (hash * 7 + 120) % 360;
  const hue3 = (hash * 13 + 240) % 360;

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:hsl(${hue1},70%,8%)"/>
          <stop offset="100%" style="stop-color:hsl(${hue2},60%,12%)"/>
        </linearGradient>
        <radialGradient id="glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" style="stop-color:hsl(${hue3},80%,50%);stop-opacity:0.3"/>
          <stop offset="100%" style="stop-color:transparent;stop-opacity:0"/>
        </radialGradient>
      </defs>
      <rect width="400" height="400" fill="url(#bg)"/>
      <circle cx="200" cy="200" r="150" fill="url(#glow)"/>
      ${generateShapes(hash)}
      <text x="200" y="380" text-anchor="middle" font-family="monospace" font-size="12" fill="rgba(255,255,255,0.2)">
        ${seed.slice(0, 12)}
      </text>
    </svg>
  `;

  return new NextResponse(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=31536000',
    },
  });
}

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

function generateShapes(hash: number): string {
  const shapes: string[] = [];
  const count = 3 + (hash % 5);

  for (let i = 0; i < count; i++) {
    const x = 50 + ((hash * (i + 1) * 7) % 300);
    const y = 50 + ((hash * (i + 1) * 13) % 300);
    const size = 20 + ((hash * (i + 1) * 3) % 60);
    const hue = (hash * (i + 1) * 17) % 360;
    const opacity = 0.1 + ((hash * (i + 1)) % 30) / 100;

    if (i % 3 === 0) {
      shapes.push(
        `<circle cx="${x}" cy="${y}" r="${size}" fill="hsl(${hue},70%,50%)" opacity="${opacity}"/>`
      );
    } else if (i % 3 === 1) {
      shapes.push(
        `<rect x="${x - size / 2}" y="${y - size / 2}" width="${size}" height="${size}" rx="4" fill="hsl(${hue},70%,50%)" opacity="${opacity}" transform="rotate(${hash % 45}, ${x}, ${y})"/>`
      );
    } else {
      const points = `${x},${y - size} ${x + size * 0.87},${y + size * 0.5} ${x - size * 0.87},${y + size * 0.5}`;
      shapes.push(
        `<polygon points="${points}" fill="hsl(${hue},70%,50%)" opacity="${opacity}"/>`
      );
    }
  }

  // Add some lines for grid effect
  for (let i = 0; i < 3; i++) {
    const startX = (hash * (i + 10)) % 400;
    const endX = (hash * (i + 20)) % 400;
    shapes.push(
      `<line x1="${startX}" y1="0" x2="${endX}" y2="400" stroke="rgba(0,229,69,0.05)" stroke-width="1"/>`
    );
  }

  return shapes.join('\n');
}
