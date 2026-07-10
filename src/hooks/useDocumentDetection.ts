import { useEffect, useRef, useCallback, useState } from 'react';

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
const clampPercent = (value: number) => Math.max(0, Math.min(100, value));

function expandQuad(quad: QuadPoints, amount = 1.015): QuadPoints {
  const cx = (quad.p1.x + quad.p2.x + quad.p3.x + quad.p4.x) / 4;
  const cy = (quad.p1.y + quad.p2.y + quad.p3.y + quad.p4.y) / 4;
  const expand = (pt: { x: number; y: number }) => ({
    x: clampPercent(cx + (pt.x - cx) * amount),
    y: clampPercent(cy + (pt.y - cy) * amount),
  });

  return {
    p1: expand(quad.p1),
    p2: expand(quad.p2),
    p3: expand(quad.p3),
    p4: expand(quad.p4),
  };
}

/**
 * Otsu binarisation on a pre-computed histogram with `totalN` samples.
 * Returns { threshold, separability }.
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
 * Pipeline:
 * 1. Per-pixel luminance + absolute saturation
 * 2. 5x5 separable box blur on luminance (wipes out text, shadows, micro-noise)
 * 3. Otsu separability check on achromatic pixels (sat < 62) to see if a white surface exists
 * 4. Bradley-Roth Local Adaptive Thresholding using an integral image of blurred luminance
 *    - Window size S = 20, Constant offset C = 8
 *    - Restricts flood-fill from crossing local boundaries/shadows (e.g. edge of paper on grey tile/floor)
 * 5. BFS flood-fill on achromatic pixels that are bright relative to their local neighborhood
 * 6. Four perspective corners via diagonal-sum extremes
 * 7. Sub-pixel Sobel corner snap
 * 8. Validity checks & exponential temporal smoothing
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
    const lumRaw = new Float32Array(N);
    const satArr = new Uint8Array(N);

    for (let i = 0; i < N; i++) {
      const R = data[i * 4], G = data[i * 4 + 1], B = data[i * 4 + 2];
      lumRaw[i] = 0.299 * R + 0.587 * G + 0.114 * B;
      const maxC = R > G ? (R > B ? R : B) : (G > B ? G : B);
      const minC = R < G ? (R < B ? R : B) : (G < B ? G : B);
      satArr[i] = maxC - minC;
    }

    // ── 2. 5x5 separable box blur on luminance (wipes out text/grout noise) ───
    const temp = new Float32Array(N);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const idx = y * W + x;
        let sum = 0;
        let count = 0;
        for (let dx = -2; dx <= 2; dx++) {
          const nx = x + dx;
          if (nx >= 0 && nx < W) {
            sum += lumRaw[y * W + nx];
            count++;
          }
        }
        temp[idx] = sum / count;
      }
    }
    const lum = new Float32Array(N);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const idx = y * W + x;
        let sum = 0;
        let count = 0;
        for (let dy = -2; dy <= 2; dy++) {
          const ny = y + dy;
          if (ny >= 0 && ny < H) {
            sum += temp[ny * W + x];
            count++;
          }
        }
        lum[idx] = sum / count;
      }
    }

    // ── 3. Achromatic mask + Otsu histogram ───────────────────────────────────
    const SAT_THRESH = 62;
    const hist = new Uint32Array(256);
    let numAchromatic = 0;
    for (let i = 0; i < N; i++) {
      if (satArr[i] < SAT_THRESH) {
        hist[Math.min(255, lum[i] | 0)]++;
        numAchromatic++;
      }
    }

    if (numAchromatic < N * 0.05) {
      lastQuadRef.current = null;
      onDetection(DEFAULT_QUAD, 0);
      animFrameRef.current = requestAnimationFrame(detect);
      return;
    }

    // ── 4. Otsu threshold on achromatic pixels ────────────────────────────────
    const { threshold: thresh, separability } = otsuOnHist(hist, numAchromatic);

    if (separability < 0.055) {
      lastQuadRef.current = null;
      onDetection(DEFAULT_QUAD, 0);
      animFrameRef.current = requestAnimationFrame(detect);
      return;
    }

    // ── 4b. Integral Image + Bradley-Roth Local Adaptive Thresholding ─────────
    const integral = new Uint32Array(N);
    for (let y = 0; y < H; y++) {
      let rowSum = 0;
      for (let x = 0; x < W; x++) {
        const idx = y * W + x;
        rowSum += lum[idx];
        integral[idx] = rowSum + (y > 0 ? integral[(y - 1) * W + x] : 0);
      }
    }

    const S = 20;
    const S2 = S >> 1;
    const C = 8;
    const isForeground = new Uint8Array(N);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const idx = y * W + x;
        const x1 = Math.max(0, x - S2);
        const x2 = Math.min(W - 1, x + S2);
        const y1 = Math.max(0, y - S2);
        const y2 = Math.min(H - 1, y + S2);
        const count = (x2 - x1 + 1) * (y2 - y1 + 1);

        const sum = integral[y2 * W + x2]
                  - (x1 > 0 ? integral[y2 * W + (x1 - 1)] : 0)
                  - (y1 > 0 ? integral[(y1 - 1) * W + x2] : 0)
                  + (x1 > 0 && y1 > 0 ? integral[(y1 - 1) * W + (x1 - 1)] : 0);

        const avg = sum / count;
        isForeground[idx] = lum[idx] >= (avg - C) ? 1 : 0;
      }
    }

    // ── 4c. Sobel gradient magnitude of blurred luminance ─────────────────────
    const grad = new Float32Array(N);
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const idx = y * W + x;
        const gx = lum[idx + 1] - lum[idx - 1];
        const gy = lum[idx + W] - lum[idx - W];
        grad[idx] = Math.abs(gx) + Math.abs(gy);
      }
    }

    // ── 5. BFS on achromatic-bright pixels → largest connected component ──────
    const visited = new Uint8Array(N);
    let bestComp: number[] = [];
    let bestScore = -1;

    const globalThresh = Math.max(55, thresh - 15);

    for (let y = 2; y < H - 2; y++) {
      for (let x = 2; x < W - 2; x++) {
        const idx = y * W + x;
        // Seed must be achromatic, locally bright, globally bright, flat (not on edge), and unvisited
        if (satArr[idx] >= SAT_THRESH || !isForeground[idx] || lum[idx] <= globalThresh || grad[idx] >= 4.8 || visited[idx]) continue;

        const comp: number[] = [];
        const queue: number[] = [idx];
        visited[idx] = 1;
        let head = 0, sumX = 0, sumY = 0;

        while (head < queue.length) {
          const cur = queue[head++];
          const cx = cur % W, cy = (cur / W) | 0;
          comp.push(cur);
          sumX += cx; sumY += cy;

          // 4-connected neighbors restricted by local & global threshold and gradient barriers
          if (cx > 1     && satArr[cur - 1] < SAT_THRESH && isForeground[cur - 1] && lum[cur - 1] > globalThresh && grad[cur - 1] < 4.8 && !visited[cur - 1]) { visited[cur - 1] = 1; queue.push(cur - 1); }
          if (cx < W - 2 && satArr[cur + 1] < SAT_THRESH && isForeground[cur + 1] && lum[cur + 1] > globalThresh && grad[cur + 1] < 4.8 && !visited[cur + 1]) { visited[cur + 1] = 1; queue.push(cur + 1); }
          if (cy > 1     && satArr[cur - W] < SAT_THRESH && isForeground[cur - W] && lum[cur - W] > globalThresh && grad[cur - W] < 4.8 && !visited[cur - W]) { visited[cur - W] = 1; queue.push(cur - W); }
          if (cy < H - 2 && satArr[cur + W] < SAT_THRESH && isForeground[cur + W] && lum[cur + W] > globalThresh && grad[cur + W] < 4.8 && !visited[cur + W]) { visited[cur + W] = 1; queue.push(cur + W); }
        }

        const area = comp.length;
        if (area < N * 0.03) continue;

        const score = area;
        if (score > bestScore) { bestScore = score; bestComp = comp; }
      }
    }

    const compArea = bestComp.length;

    if (compArea < N * 0.045 || compArea > N * 0.96) {
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

    // Calculate center of best component
    let sumX = 0, sumY = 0;
    for (const idx of bestComp) {
      sumX += idx % W;
      sumY += (idx / W) | 0;
    }
    const cxC = sumX / compArea;
    const cyC = sumY / compArea;

    // ── 7. High-precision ray-casting edge snapper ─────────────────────────────
    const snapToEdge = (pt: { x: number; y: number }) => {
      const dx = pt.x - cxC;
      const dy = pt.y - cyC;
      const len = Math.hypot(dx, dy);
      if (len < 5) return pt;

      const ux = dx / len;
      const uy = dy / len;

      let bestD = len;
      let maxGrad = -1;

      // Scan along the ray from inside the page to outside
      for (let d = len - 8; d <= len + 15; d += 0.5) {
        const px = cxC + ux * d;
        const py = cyC + uy * d;
        const ix = Math.round(px);
        const iy = Math.round(py);

        if (ix > 1 && ix < W - 2 && iy > 1 && iy < H - 2) {
          const idx = iy * W + ix;
          const g = grad[idx];
          if (g > maxGrad) {
            maxGrad = g;
            bestD = d;
          }
        }
      }

      // If a clear edge was found, snap to it, otherwise return original extreme point
      if (maxGrad > 1.2) {
        return {
          x: cxC + ux * bestD,
          y: cyC + uy * bestD
        };
      }
      return pt;
    };

    p1 = snapToEdge(p1);
    p2 = snapToEdge(p2);
    p3 = snapToEdge(p3);
    p4 = snapToEdge(p4);

    // ── 8. Validity check ─────────────────────────────────────────────────────
    const bx1 = Math.min(p1.x, p4.x), bx2 = Math.max(p2.x, p3.x);
    const by1 = Math.min(p1.y, p2.y), by2 = Math.max(p3.y, p4.y);
    const bw   = bx2 - bx1, bh = by2 - by1;
    const aspect = bw / Math.max(1, bh);

    const confidence = Math.min(1, (separability * 1.35 + compArea / N) / 1.25);

    const isValid =
      compArea > N  * 0.045  &&
      compArea < N  * 0.96   &&
      bw       > W  * 0.15   &&
      bh       > H  * 0.12   &&
      aspect   > 0.25        &&
      aspect   < 4.0         &&
      confidence > 0.24;

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

    const raw: QuadPoints = expandQuad({ p1: toP(p1), p2: toP(p2), p3: toP(p3), p4: toP(p4) });

    const k = 0.82;
    const DEAD_ZONE = 0.8;
    const shouldUpdate = (prev: QuadPoints, next: QuadPoints) => {
      const keys = ['p1', 'p2', 'p3', 'p4'] as const;
      return keys.some(p =>
        Math.abs(prev[p].x - next[p].x) > DEAD_ZONE ||
        Math.abs(prev[p].y - next[p].y) > DEAD_ZONE
      );
    };

    if (lastQuadRef.current && !shouldUpdate(lastQuadRef.current, raw)) {
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
