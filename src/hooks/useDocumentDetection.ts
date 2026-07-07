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

const DEFAULT_QUAD: QuadPoints = {
  p1: { x: 12, y: 8 }, p2: { x: 88, y: 8 },
  p3: { x: 88, y: 92 }, p4: { x: 12, y: 92 },
};

/**
 * Otsu binarisation on a pre-computed histogram with `totalN` samples.
 * Returns { threshold, separability }.
 * separability (η) = inter-class variance / total variance ∈ [0, 1].
 * η < 0.1  → no clear bimodal split (no paper visible).
 * η > 0.3  → clear paper / background separation.
 */
function otsuOnHist(
  hist: Uint32Array,
  totalN: number,
): { threshold: number; separability: number } {
  if (totalN === 0) return { threshold: 128, separability: 0 };

  let totalSum = 0;
  for (let i = 0; i < 256; i++) totalSum += i * hist[i];

  let sumB = 0, wB = 0, maxVarB = 0;
  let threshold = 128;

  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = totalN - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (totalSum - sumB) / wF;
    const varB = (wB / totalN) * (wF / totalN) * (mB - mF) ** 2;
    if (varB > maxVarB) { maxVarB = varB; threshold = t; }
  }

  // Total variance σ²_T
  const mean = totalSum / totalN;
  let totalVar = 0;
  for (let i = 0; i < 256; i++) {
    totalVar += (hist[i] / totalN) * (i - mean) ** 2;
  }

  const separability = totalVar > 0 ? maxVarB / totalVar : 0;
  return { threshold, separability };
}

/**
 * Real-time document detection from a video stream.
 *
 * KEY INSIGHT: white paper has near-zero color saturation (R ≈ G ≈ B).
 * Colored objects (posters, signs, tiles, wooden desks) have higher saturation.
 * By filtering for achromatic pixels FIRST we discard colored backgrounds before
 * applying any brightness threshold — this is what makes the detector robust.
 *
 * Pipeline (160 × 240 offscreen canvas, runs at ~15 fps):
 *
 * 1. Per-pixel:
 *    lum   = 0.299R + 0.587G + 0.114B   (luminance)
 *    sat   = max(R,G,B) − min(R,G,B)    (absolute chroma, 0-255)
 *
 * 2. Achromatic mask: sat < SAT_THRESH (45)
 *    → keeps white / gray pixels; rejects colored backgrounds & objects
 *
 * 3. 3×3 Gaussian blur on luminance (kills text noise)
 *
 * 4. Otsu threshold computed ONLY on achromatic pixels
 *    → adapts to scene brightness, never needs a hand-tuned constant
 *    → if η < 0.08 (nearly uniform) → no paper found, skip frame
 *
 * 5. BFS flood-fill on pixels that are achromatic AND above Otsu threshold
 *    → largest central bright-achromatic component = the white paper
 *
 * 6. Four perspective corners via diagonal-sum extremes:
 *    p1 (top-left)     = min(x + y)
 *    p2 (top-right)    = max(x − y)
 *    p3 (bottom-right) = max(x + y)
 *    p4 (bottom-left)  = min(x − y)
 *
 * 7. Sub-pixel Sobel corner snap (radius 5)
 *
 * 8. Validity + exponential smoothing
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

    // ~15 fps: process every 4th frame to reduce noise input
    if (++frameCountRef.current % 4 !== 0) {
      animFrameRef.current = requestAnimationFrame(detect);
      return;
    }

    const W = 160, H = 240, N = W * H;

    if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas');
      canvasRef.current.width  = W;
      canvasRef.current.height = H;
    }

    const ctx = canvasRef.current.getContext('2d', { willReadFrequently: true });
    if (!ctx) { animFrameRef.current = requestAnimationFrame(detect); return; }

    ctx.drawImage(video, 0, 0, W, H);
    const { data } = ctx.getImageData(0, 0, W, H);

    // ── 1. Per-pixel luminance + absolute saturation ───────────────────────────
    const lumRaw = new Float32Array(N);  // raw luminance (before blur)
    const satArr = new Uint8Array(N);    // max(R,G,B) − min(R,G,B)

    for (let i = 0; i < N; i++) {
      const R = data[i * 4], G = data[i * 4 + 1], B = data[i * 4 + 2];
      lumRaw[i] = 0.299 * R + 0.587 * G + 0.114 * B;
      const maxC = R > G ? (R > B ? R : B) : (G > B ? G : B);
      const minC = R < G ? (R < B ? R : B) : (G < B ? G : B);
      satArr[i] = maxC - minC;
    }

    // ── 2. 3×3 Gaussian blur on luminance ─────────────────────────────────────
    const lum = lumRaw.slice(); // copy borders as-is
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        lum[y * W + x] = (
          lumRaw[(y-1)*W+(x-1)] + 2*lumRaw[(y-1)*W+x] + lumRaw[(y-1)*W+(x+1)] +
          2*lumRaw[y*W+(x-1)]   + 4*lumRaw[y*W+x]     + 2*lumRaw[y*W+(x+1)]   +
          lumRaw[(y+1)*W+(x-1)] + 2*lumRaw[(y+1)*W+x] + lumRaw[(y+1)*W+(x+1)]
        ) / 16;
      }
    }

    // ── 3. Achromatic mask + Otsu histogram ───────────────────────────────────
    // White paper: sat ≈ 0.   Colorful objects: sat >> 45.
    // This rejects: signs, posters, tiles with color, wooden desks, etc.
    const SAT_THRESH = 45;

    const hist = new Uint32Array(256);
    let numAchromatic = 0;
    for (let i = 0; i < N; i++) {
      if (satArr[i] < SAT_THRESH) {
        hist[Math.min(255, lum[i] | 0)]++;
        numAchromatic++;
      }
    }

    // Bail out if barely any achromatic pixels → no white surface in view
    if (numAchromatic < N * 0.05) {
      lastQuadRef.current = null;
      onDetection(DEFAULT_QUAD, 0);
      animFrameRef.current = requestAnimationFrame(detect);
      return;
    }

    // ── 4. Otsu threshold on achromatic pixels ────────────────────────────────
    const { threshold: thresh, separability } = otsuOnHist(hist, numAchromatic);

    // η < 0.08: scene too uniform, no clear paper edge
    if (separability < 0.08) {
      lastQuadRef.current = null;
      onDetection(DEFAULT_QUAD, 0);
      animFrameRef.current = requestAnimationFrame(detect);
      return;
    }

    // ── 5. BFS on achromatic-bright pixels → largest connected component ──────
    const visited = new Uint8Array(N);
    let bestComp: number[] = [];
    let bestScore = -1;

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const idx = y * W + x;
        // Seed: achromatic AND above Otsu threshold AND not yet visited
        if (satArr[idx] >= SAT_THRESH || lum[idx] <= thresh || visited[idx]) continue;

        const comp: number[] = [];
        const queue: number[] = [idx];
        visited[idx] = 1;
        let head = 0, sumX = 0, sumY = 0;

        while (head < queue.length) {
          const cur = queue[head++];
          const cx = cur % W, cy = (cur / W) | 0;
          comp.push(cur);
          sumX += cx; sumY += cy;

          // 4-connected neighbours — explicit bounds to prevent row wrapping
          if (cx > 0     && satArr[cur - 1] < SAT_THRESH && lum[cur - 1] > thresh && !visited[cur - 1]) { visited[cur - 1] = 1; queue.push(cur - 1); }
          if (cx < W - 1 && satArr[cur + 1] < SAT_THRESH && lum[cur + 1] > thresh && !visited[cur + 1]) { visited[cur + 1] = 1; queue.push(cur + 1); }
          if (cy > 0     && satArr[cur - W] < SAT_THRESH && lum[cur - W] > thresh && !visited[cur - W]) { visited[cur - W] = 1; queue.push(cur - W); }
          if (cy < H - 1 && satArr[cur + W] < SAT_THRESH && lum[cur + W] > thresh && !visited[cur + W]) { visited[cur + W] = 1; queue.push(cur + W); }
        }

        const area = comp.length;
        if (area < N * 0.04) continue; // discard tiny components

        // Prefer large, centrally-located components
        const cxC = sumX / area, cyC = sumY / area;
        const distToCenter = Math.hypot(cxC - W / 2, cyC - H / 2);
        const score = area / (1 + distToCenter * 0.10);
        if (score > bestScore) { bestScore = score; bestComp = comp; }
      }
    }

    const compArea = bestComp.length;

    // Reject: component too small (no paper) or too large (whole scene is white)
    if (compArea < N * 0.06 || compArea > N * 0.93) {
      lastQuadRef.current = null;
      onDetection(DEFAULT_QUAD, 0);
      animFrameRef.current = requestAnimationFrame(detect);
      return;
    }

    // ── 6. Four perspective corners — diagonal-sum extremes ───────────────────
    let minSum  = Infinity,  p1 = { x: W / 2, y: H / 2 };
    let maxSum  = -Infinity, p3 = { x: W / 2, y: H / 2 };
    let maxDiff = -Infinity, p2 = { x: W / 2, y: H / 2 };
    let minDiff = Infinity,  p4 = { x: W / 2, y: H / 2 };

    for (const idx of bestComp) {
      const x = idx % W, y = (idx / W) | 0;
      const s = x + y, d = x - y;
      if (s < minSum)  { minSum  = s; p1 = { x, y }; }
      if (s > maxSum)  { maxSum  = s; p3 = { x, y }; }
      if (d > maxDiff) { maxDiff = d; p2 = { x, y }; }
      if (d < minDiff) { minDiff = d; p4 = { x, y }; }
    }

    // ── 7. Sub-pixel Sobel corner snap (radius 5) ─────────────────────────────
    const refine = (pt: { x: number; y: number }, radius = 5) => {
      let best = pt, maxMag = -1;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const cx = (pt.x + dx) | 0, cy = (pt.y + dy) | 0;
          if (cx > 1 && cx < W - 2 && cy > 1 && cy < H - 2) {
            const gx =
              (lumRaw[(cy-1)*W+(cx+1)] + 2*lumRaw[cy*W+(cx+1)] + lumRaw[(cy+1)*W+(cx+1)]) -
              (lumRaw[(cy-1)*W+(cx-1)] + 2*lumRaw[cy*W+(cx-1)] + lumRaw[(cy+1)*W+(cx-1)]);
            const gy =
              (lumRaw[(cy+1)*W+(cx-1)] + 2*lumRaw[(cy+1)*W+cx] + lumRaw[(cy+1)*W+(cx+1)]) -
              (lumRaw[(cy-1)*W+(cx-1)] + 2*lumRaw[(cy-1)*W+cx] + lumRaw[(cy-1)*W+(cx+1)]);
            const mag = gx * gx + gy * gy;
            if (mag > maxMag) { maxMag = mag; best = { x: cx, y: cy }; }
          }
        }
      }
      return best;
    };

    p1 = refine(p1);
    p2 = refine(p2);
    p3 = refine(p3);
    p4 = refine(p4);

    // ── 8. Validity check ─────────────────────────────────────────────────────
    const bx1 = Math.min(p1.x, p4.x), bx2 = Math.max(p2.x, p3.x);
    const by1 = Math.min(p1.y, p2.y), by2 = Math.max(p3.y, p4.y);
    const bw   = bx2 - bx1, bh = by2 - by1;
    const aspect = bw / Math.max(1, bh);

    // Confidence: based on Otsu quality + how much of the frame the paper covers
    const confidence = Math.min(1, (separability + compArea / N) / 1.4);

    const isValid =
      compArea > N  * 0.06   &&
      compArea < N  * 0.93   &&
      bw       > W  * 0.15   &&
      bh       > H  * 0.12   &&
      aspect   > 0.25        &&
      aspect   < 4.0         &&
      confidence > 0.30;

    if (!isValid) {
      lastQuadRef.current = null;
      onDetection(DEFAULT_QUAD, 0);
      animFrameRef.current = requestAnimationFrame(detect);
      return;
    }

    // ── 9. Normalise + exponential temporal smoothing ─────────────────────────
    const toP = (pt: { x: number; y: number }) => ({
      x: Math.max(0, Math.min(100, (pt.x / W) * 100)),
      y: Math.max(0, Math.min(100, (pt.y / H) * 100)),
    });

    const raw: QuadPoints = { p1: toP(p1), p2: toP(p2), p3: toP(p3), p4: toP(p4) };

    // High smoothing factor: 0.82 retains 82% of the previous position each frame
    // (was 0.55) — greatly reduces jitter while still tracking real movement.
    const k = 0.82;

    // Dead-zone: only update if a corner moved more than 0.8% of the viewport.
    // This suppresses micro-jitter from the detector without delaying real motion.
    const DEAD_ZONE = 0.8;
    const shouldUpdate = (prev: QuadPoints, next: QuadPoints) => {
      const keys = ['p1', 'p2', 'p3', 'p4'] as const;
      return keys.some(p =>
        Math.abs(prev[p].x - next[p].x) > DEAD_ZONE ||
        Math.abs(prev[p].y - next[p].y) > DEAD_ZONE
      );
    };

    if (lastQuadRef.current && !shouldUpdate(lastQuadRef.current, raw)) {
      // Movement is within dead-zone — skip update, keep current stable quad
      onDetection(lastQuadRef.current, confidence);
      animFrameRef.current = requestAnimationFrame(detect);
      return;
    }

    const out: QuadPoints = lastQuadRef.current
      ? {
          p1: { x: lastQuadRef.current.p1.x * k + raw.p1.x * (1 - k), y: lastQuadRef.current.p1.y * k + raw.p1.y * (1 - k) },
          p2: { x: lastQuadRef.current.p2.x * k + raw.p2.x * (1 - k), y: lastQuadRef.current.p2.y * k + raw.p2.y * (1 - k) },
          p3: { x: lastQuadRef.current.p3.x * k + raw.p3.x * (1 - k), y: lastQuadRef.current.p3.y * k + raw.p3.y * (1 - k) },
          p4: { x: lastQuadRef.current.p4.x * k + raw.p4.x * (1 - k), y: lastQuadRef.current.p4.y * k + raw.p4.y * (1 - k) },
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
