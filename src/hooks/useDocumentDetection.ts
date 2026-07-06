import { useEffect, useRef, useCallback } from 'react';

export interface QuadPoints {
  p1: { x: number; y: number }; // top-left
  p2: { x: number; y: number }; // top-right
  p3: { x: number; y: number }; // bottom-right
  p4: { x: number; y: number }; // bottom-left
}

interface UseDocumentDetectionOptions {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  active: boolean;
  onDetection: (quad: QuadPoints, confidence: number) => void;
}

/**
 * Least-squares linear fit.  Returns {slope, intercept} for  y = slope*x + intercept.
 * Returns null if fewer than 5 points or degenerate.
 */
function fitLine(pts: { x: number; y: number }[]): { slope: number; intercept: number } | null {
  const n = pts.length;
  if (n < 5) return null;
  let sx = 0, sy = 0, sxy = 0, sxx = 0;
  for (const p of pts) { sx += p.x; sy += p.y; sxy += p.x * p.y; sxx += p.x * p.x; }
  const denom = n * sxx - sx * sx;
  if (Math.abs(denom) < 1e-4) return null;
  const slope     = (n * sxy - sx * sy) / denom;
  const intercept = (sy - slope * sx) / n;
  return { slope, intercept };
}

/**
 * Intersect:
 *   col = A*row + B   (left/right vertical-ish edge, expressed as col-from-row)
 *   row = C*col + D   (top/bottom horizontal-ish edge, expressed as row-from-col)
 *
 * Substituting:  row = C*(A*row + B) + D  →  row(1 - CA) = CB + D
 * Returns { x: col, y: row }
 */
function intersectEdges(
  colFromRow: { slope: number; intercept: number },
  rowFromCol: { slope: number; intercept: number },
): { x: number; y: number } | null {
  const A = colFromRow.slope, B = colFromRow.intercept;
  const C = rowFromCol.slope, D = rowFromCol.intercept;
  const denom = 1 - C * A;
  if (Math.abs(denom) < 0.01) return null;
  const row = (C * B + D) / denom;
  const col = A * row + B;
  return { x: col, y: row };
}

const DEFAULT_QUAD: QuadPoints = {
  p1: { x: 12, y: 8 }, p2: { x: 88, y: 8 },
  p3: { x: 88, y: 92 }, p4: { x: 12, y: 92 },
};

/**
 * Detects document boundaries in real-time from a video stream.
 *
 * Algorithm — edge-gradient scanline approach (works in any lighting):
 * 1. Grayscale + 3×3 Gaussian blur
 * 2. Sobel edge magnitude + directional (gx, gy) components
 * 3. Horizontal scanlines  → find leftmost "dark→paper" (gx > 0) and
 *                            rightmost "paper→dark" (gx < 0) edge per row
 *    Vertical scanlines    → find topmost  "dark→paper" (gy > 0) and
 *                            bottommost "paper→dark" (gy < 0) edge per column
 * 4. Least-squares line fit to each of the 4 edge point sets
 * 5. Intersect the 4 lines → 4 perspective-correct corners
 * 6. Validity checks (area, aspect ratio, coverage)
 * 7. Exponential temporal smoothing to reduce jitter
 */
export function useDocumentDetection({
  videoRef,
  active,
  onDetection,
}: UseDocumentDetectionOptions) {
  const animFrameRef  = useRef<number | null>(null);
  const canvasRef     = useRef<HTMLCanvasElement | null>(null);
  const lastQuadRef   = useRef<QuadPoints | null>(null);
  const frameCountRef = useRef(0);

  const detect = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || !active) {
      animFrameRef.current = requestAnimationFrame(detect);
      return;
    }

    // ~15 fps: process every other frame
    if (++frameCountRef.current % 2 !== 0) {
      animFrameRef.current = requestAnimationFrame(detect);
      return;
    }

    const W = 160, H = 240;

    if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas');
      canvasRef.current.width  = W;
      canvasRef.current.height = H;
    }

    const ctx = canvasRef.current.getContext('2d', { willReadFrequently: true });
    if (!ctx) { animFrameRef.current = requestAnimationFrame(detect); return; }

    ctx.drawImage(video, 0, 0, W, H);
    const { data } = ctx.getImageData(0, 0, W, H);

    // ── 1. Grayscale ──────────────────────────────────────────────────────────
    const gray = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) {
      gray[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
    }

    // ── 2. 3×3 Gaussian blur (weights: 1 2 1 / 2 4 2 / 1 2 1 / 16) ──────────
    const blur = new Float32Array(W * H);
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        blur[y * W + x] = (
          gray[(y-1)*W+(x-1)] + 2*gray[(y-1)*W+x] + gray[(y-1)*W+(x+1)] +
          2*gray[y*W+(x-1)]   + 4*gray[y*W+x]     + 2*gray[y*W+(x+1)]   +
          gray[(y+1)*W+(x-1)] + 2*gray[(y+1)*W+x] + gray[(y+1)*W+(x+1)]
        ) / 16;
      }
    }

    // ── 3. Sobel edge magnitude + directional components ─────────────────────
    const edgeMag = new Float32Array(W * H);
    const gxArr   = new Float32Array(W * H);
    const gyArr   = new Float32Array(W * H);
    let maxMag = 0;

    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const gx =
          (blur[(y-1)*W+(x+1)] + 2*blur[y*W+(x+1)] + blur[(y+1)*W+(x+1)]) -
          (blur[(y-1)*W+(x-1)] + 2*blur[y*W+(x-1)] + blur[(y+1)*W+(x-1)]);
        const gy =
          (blur[(y+1)*W+(x-1)] + 2*blur[(y+1)*W+x] + blur[(y+1)*W+(x+1)]) -
          (blur[(y-1)*W+(x-1)] + 2*blur[(y-1)*W+x] + blur[(y-1)*W+(x+1)]);
        const mag = Math.sqrt(gx * gx + gy * gy);
        edgeMag[y * W + x] = mag;
        gxArr[y * W + x]   = gx;
        gyArr[y * W + x]   = gy;
        if (mag > maxMag) maxMag = mag;
      }
    }

    // No usable contrast → bail out
    if (maxMag < 15) {
      lastQuadRef.current = null;
      onDetection(DEFAULT_QUAD, 0);
      animFrameRef.current = requestAnimationFrame(detect);
      return;
    }

    const edgeThresh = maxMag * 0.18; // 18% of peak edge magnitude

    // ── 4. Directed scanline edge finder ─────────────────────────────────────
    //
    //  Horizontal rows → left / right document edges
    //  A "left edge" at row r is the FIRST column where a strong POSITIVE gx
    //  (dark background → bright paper) is found scanning left→right.
    //  A "right edge" is the LAST column with strong NEGATIVE gx found right→left.
    //
    //  Vertical columns → top / bottom document edges (same idea with gy).

    const leftPts:   { x: number; y: number }[] = []; // {x: row,  y: leftCol}
    const rightPts:  { x: number; y: number }[] = []; // {x: row,  y: rightCol}
    const topPts:    { x: number; y: number }[] = []; // {x: col,  y: topRow}
    const bottomPts: { x: number; y: number }[] = []; // {x: col,  y: bottomRow}

    for (let row = 4; row < H - 4; row++) {
      let lCol = -1, rCol = -1;

      for (let col = 3; col < W - 3; col++) {
        if (edgeMag[row * W + col] > edgeThresh && gxArr[row * W + col] > 0) {
          lCol = col; break;
        }
      }
      for (let col = W - 4; col >= 3; col--) {
        if (edgeMag[row * W + col] > edgeThresh && gxArr[row * W + col] < 0) {
          rCol = col; break;
        }
      }

      if (lCol >= 0 && rCol > lCol + W * 0.15) {
        leftPts.push({ x: row, y: lCol });
        rightPts.push({ x: row, y: rCol });
      }
    }

    for (let col = 4; col < W - 4; col++) {
      let tRow = -1, bRow = -1;

      for (let row = 3; row < H - 3; row++) {
        if (edgeMag[row * W + col] > edgeThresh && gyArr[row * W + col] > 0) {
          tRow = row; break;
        }
      }
      for (let row = H - 4; row >= 3; row--) {
        if (edgeMag[row * W + col] > edgeThresh && gyArr[row * W + col] < 0) {
          bRow = row; break;
        }
      }

      if (tRow >= 0 && bRow > tRow + H * 0.12) {
        topPts.push({ x: col, y: tRow });
        bottomPts.push({ x: col, y: bRow });
      }
    }

    // ── 5. Minimum coverage check ─────────────────────────────────────────────
    const MIN_PTS = 20;
    if (
      leftPts.length < MIN_PTS || rightPts.length < MIN_PTS ||
      topPts.length  < MIN_PTS || bottomPts.length < MIN_PTS
    ) {
      lastQuadRef.current = null;
      onDetection(DEFAULT_QUAD, 0);
      animFrameRef.current = requestAnimationFrame(detect);
      return;
    }

    // ── 6. Least-squares line fit ─────────────────────────────────────────────
    //  leftLine / rightLine: col = slope*row + intercept
    //  topLine / bottomLine: row = slope*col + intercept
    const leftLine   = fitLine(leftPts);
    const rightLine  = fitLine(rightPts);
    const topLine    = fitLine(topPts);
    const bottomLine = fitLine(bottomPts);

    if (!leftLine || !rightLine || !topLine || !bottomLine) {
      lastQuadRef.current = null;
      onDetection(DEFAULT_QUAD, 0);
      animFrameRef.current = requestAnimationFrame(detect);
      return;
    }

    // ── 7. Four perspective corners from line intersections ───────────────────
    const c1 = intersectEdges(leftLine,  topLine);     // top-left
    const c2 = intersectEdges(rightLine, topLine);     // top-right
    const c3 = intersectEdges(rightLine, bottomLine);  // bottom-right
    const c4 = intersectEdges(leftLine,  bottomLine);  // bottom-left

    if (!c1 || !c2 || !c3 || !c4) {
      lastQuadRef.current = null;
      onDetection(DEFAULT_QUAD, 0);
      animFrameRef.current = requestAnimationFrame(detect);
      return;
    }

    // ── 8. Validity checks ────────────────────────────────────────────────────
    const avgW   = ((c2.x - c1.x) + (c3.x - c4.x)) / 2;
    const avgH   = ((c4.y - c1.y) + (c3.y - c2.y)) / 2;
    const aspect = avgW / Math.max(1, avgH);
    const area   = avgW * avgH;

    // Confidence: fraction of scanlines that found clean document edges
    const confidence = Math.min(1,
      (leftPts.length / H + rightPts.length / H + topPts.length / W + bottomPts.length / W) / 2
    );

    const isValid =
      area      > W * H * 0.08  &&
      area      < W * H * 0.97  &&
      avgW      > W  * 0.15     &&
      avgH      > H  * 0.12     &&
      aspect    > 0.30          &&
      aspect    < 3.50          &&
      confidence > 0.28;

    if (!isValid) {
      lastQuadRef.current = null;
      onDetection(DEFAULT_QUAD, 0);
      animFrameRef.current = requestAnimationFrame(detect);
      return;
    }

    // ── 9. Normalize to percentage coordinates ────────────────────────────────
    const toP = (pt: { x: number; y: number }) => ({
      x: Math.max(0, Math.min(100, (pt.x / W) * 100)),
      y: Math.max(0, Math.min(100, (pt.y / H) * 100)),
    });

    const raw: QuadPoints = {
      p1: toP(c1), p2: toP(c2), p3: toP(c3), p4: toP(c4),
    };

    // ── 10. Exponential temporal smoothing (reduces jitter) ───────────────────
    const k   = 0.55;
    const out: QuadPoints = lastQuadRef.current
      ? {
          p1: { x: lastQuadRef.current.p1.x * k + raw.p1.x * (1-k), y: lastQuadRef.current.p1.y * k + raw.p1.y * (1-k) },
          p2: { x: lastQuadRef.current.p2.x * k + raw.p2.x * (1-k), y: lastQuadRef.current.p2.y * k + raw.p2.y * (1-k) },
          p3: { x: lastQuadRef.current.p3.x * k + raw.p3.x * (1-k), y: lastQuadRef.current.p3.y * k + raw.p3.y * (1-k) },
          p4: { x: lastQuadRef.current.p4.x * k + raw.p4.x * (1-k), y: lastQuadRef.current.p4.y * k + raw.p4.y * (1-k) },
        }
      : raw;

    lastQuadRef.current = out;
    onDetection(out, confidence);

    animFrameRef.current = requestAnimationFrame(detect);
  }, [videoRef, active, onDetection]);

  useEffect(() => {
    if (active) {
      frameCountRef.current = 0;
      animFrameRef.current  = requestAnimationFrame(detect);
    }
    return () => { if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current); };
  }, [active, detect]);
}
