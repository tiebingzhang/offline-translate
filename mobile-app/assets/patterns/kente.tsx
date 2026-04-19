import type { ReactElement } from 'react';
import Svg, { Defs, G, Line, Pattern, Rect } from 'react-native-svg';

// Developer-authored Senegalese-textile motif (FR-029): a geometric
// Kente / mudcloth-inspired weave built entirely from SVG primitives.
// No AI-generated imagery; no stock art. The pattern is composed of
// repeating stripes (warp), cross weaves (weft), and small diamond
// accents, sized so it tiles edge-to-edge at any dimension.
// (001-wolof-translate-mobile:T099)

export interface KentePatternProps {
  readonly width: number | string;
  readonly height: number | string;
  /** Stripe + weave color. Caller supplies a token-derived hex. */
  readonly stroke: string;
  /** Diamond accent color. Caller supplies a token-derived hex. */
  readonly accent: string;
  /**
   * Tile size in SVG user units. 48 produces a dense weave suited to
   * full-screen backgrounds; larger values yield a coarser look.
   * (001-wolof-translate-mobile:T099)
   */
  readonly tile?: number;
  /** Applied to the <Svg> root opacity; clamp at the call site. */
  readonly opacity?: number;
}

export function KentePattern({
  width,
  height,
  stroke,
  accent,
  tile = 48,
  opacity = 1,
}: KentePatternProps): ReactElement {
  const half = tile / 2;
  const quarter = tile / 4;
  const strokeW = Math.max(1, tile / 24);
  const thickStripe = Math.max(2, tile / 12);

  return (
    <Svg width={width} height={height} opacity={opacity}>
      <Defs>
        <Pattern
          id="wt-kente-tile"
          patternUnits="userSpaceOnUse"
          x={0}
          y={0}
          width={tile}
          height={tile}
        >
          {/* Two warp stripes per tile — the top band is thicker, the
              lower band is a simple hairline, evoking the alternating
              rhythm of woven Kente cloth. */}
          <Rect x={0} y={0} width={tile} height={thickStripe} fill={stroke} />
          <Line
            x1={0}
            y1={half}
            x2={tile}
            y2={half}
            stroke={stroke}
            strokeWidth={strokeW}
          />

          {/* Weft crosses — two short vertical threads per tile to
              suggest the weave intersecting the warp. */}
          <Line
            x1={quarter}
            y1={thickStripe}
            x2={quarter}
            y2={half}
            stroke={stroke}
            strokeWidth={strokeW}
          />
          <Line
            x1={tile - quarter}
            y1={half}
            x2={tile - quarter}
            y2={tile - strokeW}
            stroke={stroke}
            strokeWidth={strokeW}
          />

          {/* Diamond accent in the lower quadrant — a simplified
              geometric motif that echoes mudcloth symbol work without
              copying any specific regional glyph. */}
          <G>
            <Line
              x1={half}
              y1={half + quarter / 2}
              x2={half + quarter / 2}
              y2={half + quarter}
              stroke={accent}
              strokeWidth={strokeW}
            />
            <Line
              x1={half + quarter / 2}
              y1={half + quarter}
              x2={half}
              y2={half + quarter + quarter / 2}
              stroke={accent}
              strokeWidth={strokeW}
            />
            <Line
              x1={half}
              y1={half + quarter + quarter / 2}
              x2={half - quarter / 2}
              y2={half + quarter}
              stroke={accent}
              strokeWidth={strokeW}
            />
            <Line
              x1={half - quarter / 2}
              y1={half + quarter}
              x2={half}
              y2={half + quarter / 2}
              stroke={accent}
              strokeWidth={strokeW}
            />
          </G>
        </Pattern>
      </Defs>
      <Rect width="100%" height="100%" fill="url(#wt-kente-tile)" />
    </Svg>
  );
}

export default KentePattern;
