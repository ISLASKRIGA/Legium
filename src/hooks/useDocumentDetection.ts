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
 * Compute Otsu's optimal binarization threshold for a grayscale image.
 * Maximises inter-class variance → finds the natural break between
 * "paper" (bright) and "background" (dark), regardless of absolute brightness.
 * Returns { threshold, separability } where separability ∈ [0, 1].
 * Separability < 0.01 means no document is visible.
 */
function otsuThreshold(blur: Float32Array, n: number): { threshold: number; separability: number } {
  const hist = new Uint32Array(256);
  for (let i = 0; i < n; i++) hist[Math.min(255, blur[i] | 0)]++;

  let totalSum = 0;
  for (let i = 0; i < 256; i++) totalSum += i * hist[i];

  let sumB = 0, wB = 0;
  let maxVar = 0;
  let threshold = 128;

  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = n - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (totalSum - sumB) / wF;
    const varBetween = (wB / n) * (wF / n) * (mB - mF) * (mB - mF);
    if (varBetween > maxVar) { maxVar = varBetween; threshold = t; }
  }

  // Total variance (σ²_T) for normalisation
  let mean = totalSum / n, totalVar = 0;
  for (let i = 0; i < n; i++) totalVar += (blur[i] - mean) ** 2;
  totalVar /= n;
  const separability = totalVar > 0 ? maxVar / totalVar : 0;

  return { threshold, separability };
}

/**
 * Detects document boundaries in real-time from a video stream.
 *
 * Algorithm — Otsu + bright-region BFS + diagonal-extreme corners + Sobel refinement:
 * 1. Grayscale + 3×3 Gaussian blur
 * 2. Otsu binarisation: automatically finds the paper / background split,
 *    regardless of scene brightness (works on dark tile, gray desk, white desk, …)
 * 3. BFS flood-fill from every bright seed → find the largest bright connected
 *    component (= the white paper sheet)
 * 4. Four perspective corners via diagonal-sum extremes:
 *      Top-Left  → minimize  x + y
 *      Top-Right → maximize  x − y
 *      Bot-Right → maximize  x + y
 *      Bot-Left  → minimize  x − y
 * 5. Sub-pixel corner snap with Sobel gradient search (radius 5)
 * 6. Validity + confidence checks
 * 7. Exponential temporal smoothing to kill jitter
 *
 * Why Otsu instead of a fixed brightness fraction:
 *   A fixed fraction fails when the background itself is bright (white desk, office).
 *   Otsu adapts to the actual bimodal histogram, always finding the optimal split.
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

    // ~15 fps: skip every other frame
    if (++frameCountRef.current % 2 !== 0) {
      animFrameRef.current = requestAnimationFrame(detect);
      return;
    }

    const W = 160, H = 240;
    const N = W * H;

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
    const gray = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      gray[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
    }

    // ── 2. 3×3 Gaussian blur (kernel 1 2 1 / 2 4 2 / 1 2 1 / 16) ─────────────
    const blur = new Float32Array(N);
    // copy borders as-is
    for (let i = 0; i < N; i++) blur[i] = gray[i];
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        blur[y * W + x] = (
          gray[(y-1)*W+(x-1)] + 2*gray[(y-1)*W+x] + gray[(y-1)*W+(x+1)] +
          2*gray[y*W+(x-1)]   + 4*gray[y*W+x]     + 2*gray[y*W+(x+1)]   +
          gray[(y+1)*W+(x-1)] + 2*gray[(y+1)*W+x] + gray[(y+1)*W+(x+1)]
        ) >> 4; // divide by 16 via integer shift for speed
      }
    }

    // ── 3. Otsu threshold ─────────────────────────────────────────────────────
    const { threshold: thresh, separability } = otsuThreshold(blur, N);

    // separability < 0.015 → scene too uniform, no paper visible
    if (separability < 0.015) {
      lastQuadRef.current = null;
      onDetection(DEFAULT_QUAD, 0);
      animFrameRef.current = requestAnimationFrame(detect);
      return;
    }

    // ── 4. BFS → largest bright connected component ────────────────────────────
    // Score = area / (1 + distance_from_center * 0.1)
    // This prefers central, large components (the paper the user is aiming at).
    const visited = new Uint8Array(N);
    let bestComp: number[] = [];   // pixel indices
    let bestScore = -1;

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const idx = y * W + x;
        if (blur[idx] <= thresh || visited[idx]) continue;

        const comp: number[] = [];
        const queue: number[] = [idx];
        visited[idx] = 1;
        let head = 0, sumX = 0, sumY = 0;

        while (head < queue.length) {
          const cur = queue[head++];
          const cx = cur % W, cy = (cur / W) | 0;
          comp.push(cur);
          sumX += cx; sumY += cy;

          // 4-connected neighbours — use explicit boundary checks to avoid wrap-around
          if (cx > 0     && blur[cur - 1] > thresh && !visited[cur - 1]) { visited[cur - 1] = 1; queue.push(cur - 1); }
          if (cx < W - 1 && blur[cur + 1] > thresh && !visited[cur + 1]) { visited[cur + 1] = 1; queue.push(cur + 1); }
          if (cy > 0     && blur[cur - W] > thresh && !visited[cur - W]) { visited[cur - W] = 1; queue.push(cur - W); }
          if (cy < H - 1 && blur[cur + W] > thresh && !visited[cur + W]) { visited[cur + W] = 1; queue.push(cur + W); }
        }

        const area = comp.length;
        if (area < N * 0.04) continue; // too small → skip

        const cxC = sumX / area, cyC = sumY / area;
        const distToCenter = Math.hypot(cxC - W / 2, cyC - H / 2);
        const score = area / (1 + distToCenter * 0.10);

        if (score > bestScore) { bestScore = score; bestComp = comp; }
      }
    }

    const compArea = bestComp.length;

    if (compArea < N * 0.06 || compArea > N * 0.93) {
      // Component is too small (no document) or too large (entire scene is bright)
      lastQuadRef.current = null;
      onDetection(DEFAULT_QUAD, 0);
      animFrameRef.current = requestAnimationFrame(detect);
      return;
    }

    // ── 5. Four perspective corners via diagonal-sum extremes ──────────────────
    let minSum = Infinity,  p1 = { x: 0, y: 0 };
    let maxSum = -Infinity, p3 = { x: 0, y: 0 };
    let maxDiff = -Infinity, p2 = { x: 0, y: 0 };
    let minDiff = Infinity,  p4 = { x: 0, y: 0 };

    for (const idx of bestComp) {
      const x = idx % W, y = (idx / W) | 0;
      const s = x + y, d = x - y;
      if (s < minSum)  { minSum  = s; p1 = { x, y }; }
      if (s > maxSum)  { maxSum  = s; p3 = { x, y }; }
      if (d > maxDiff) { maxDiff = d; p2 = { x, y }; }
      if (d < minDiff) { minDiff = d; p4 = { x, y }; }
    }

    // ── 6. Sobel corner refinement (radius 5 → snaps to nearest real edge) ────
    const refine = (pt: { x: number; y: number }, radius = 5) => {
      let best = pt, maxMag = -1;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const cx = (pt.x + dx) | 0, cy = (pt.y + dy) | 0;
          if (cx > 1 && cx < W - 2 && cy > 1 && cy < H - 2) {
            const gx =
              (gray[(cy-1)*W+(cx+1)] + 2*gray[cy*W+(cx+1)] + gray[(cy+1)*W+(cx+1)]) -
              (gray[(cy-1)*W+(cx-1)] + 2*gray[cy*W+(cx-1)] + gray[(cy+1)*W+(cx-1)]);
            const gy =
              (gray[(cy+1)*W+(cx-1)] + 2*gray[(cy+1)*W+cx] + gray[(cy+1)*W+(cx+1)]) -
              (gray[(cy-1)*W+(cx-1)] + 2*gray[(cy-1)*W+cx] + gray[(cy-1)*W+(cx+1)]);
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

    // ── 7. Validity + confidence ───────────────────────────────────────────────
    const bx1 = Math.min(p1.x, p4.x), bx2 = Math.max(p2.x, p3.x);
    const by1 = Math.min(p1.y, p2.y), by2 = Math.max(p3.y, p4.y);
    const bw  = bx2 - bx1, bh = by2 - by1;

    // confidence = how well-separated the two classes are × how large the document is
    const confidence = Math.min(1,
      separability * 10 * (compArea / N) * (1 / 0.15)
    );

    const isValid =
      compArea    > N * 0.06     &&
      compArea    < N * 0.93     &&
      bw          > W * 0.15     &&
      bh          > H * 0.12     &&
      (bw / Math.max(1, bh)) > 0.25 &&
      (bw / Math.max(1, bh)) < 4.0  &&
      confidence  > 0.35;

    if (!isValid) {
      lastQuadRef.current = null;
      onDetection(DEFAULT_QUAD, 0);
      animFrameRef.current = requestAnimationFrame(detect);
      return;
    }

    // ── 8. Normalise to % and apply exponential smoothing ─────────────────────
    const toP = (pt: { x: number; y: number }) => ({
      x: Math.max(0, Math.min(100, (pt.x / W) * 100)),
      y: Math.max(0, Math.min(100, (pt.y / H) * 100)),
    });

    const raw: QuadPoints = { p1: toP(p1), p2: toP(p2), p3: toP(p3), p4: toP(p4) };
    const k = 0.55;

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
