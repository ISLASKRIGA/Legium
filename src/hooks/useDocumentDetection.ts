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
 * Detects document boundaries in real-time from a video stream.
 *
 * Algorithm (runs on a 160×240 offscreen canvas for performance):
 * 1. Grayscale + 5×5 box blur to kill text noise
 * 2. Adaptive threshold → binary mask of bright (paper) region
 * 3. BFS to find the largest bright connected component
 * 4. Four perspective corners via diagonal extreme-point trick:
 *    • Top-Left     → minimize  x + y
 *    • Top-Right    → maximize  x − y
 *    • Bottom-Right → maximize  x + y
 *    • Bottom-Left  → minimize  x − y
 * 5. Sub-pixel corner refinement with Sobel gradient search
 * 6. Validity checks (area, aspect ratio)
 * 7. Exponential temporal smoothing to eliminate jitter
 */
export function useDocumentDetection({
  videoRef,
  active,
  onDetection,
}: UseDocumentDetectionOptions) {
  const animFrameRef   = useRef<number | null>(null);
  const canvasRef      = useRef<HTMLCanvasElement | null>(null);
  const lastQuadRef    = useRef<QuadPoints | null>(null);
  const frameCountRef  = useRef(0);

  const detect = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || !active) {
      animFrameRef.current = requestAnimationFrame(detect);
      return;
    }

    // Skip every other frame to halve CPU load
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

    const canvas = canvasRef.current;
    const ctx    = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) { animFrameRef.current = requestAnimationFrame(detect); return; }

    ctx.drawImage(video, 0, 0, W, H);
    const { data } = ctx.getImageData(0, 0, W, H);

    // ── 1. Grayscale ──────────────────────────────────────────────────────────
    const gray = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) {
      gray[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
    }

    // ── 2. 5×5 box blur + find global min/max ─────────────────────────────────
    const blurred = new Float32Array(W * H);
    let gMin = 255, gMax = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let sum = 0, cnt = 0;
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            const ny = y + dy, nx = x + dx;
            if (ny >= 0 && ny < H && nx >= 0 && nx < W) { sum += gray[ny * W + nx]; cnt++; }
          }
        }
        const v = sum / cnt;
        blurred[y * W + x] = v;
        if (v < gMin) gMin = v;
        if (v > gMax) gMax = v;
      }
    }

    // ── 3. Adaptive threshold ─────────────────────────────────────────────────
    const thresh = gMin + (gMax - gMin) * 0.52;

    // ── 4. BFS → largest bright component ────────────────────────────────────
    const visited = new Uint8Array(W * H);
    let bestComp: { x: number; y: number }[] = [];
    let bestScore = -1;

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const idx = y * W + x;
        if (blurred[idx] <= thresh || visited[idx]) continue;

        const comp: { x: number; y: number }[] = [];
        const queue = [idx];
        visited[idx] = 1;
        let sumX = 0, sumY = 0, head = 0;

        while (head < queue.length) {
          const cur = queue[head++];
          const cx = cur % W, cy = (cur / W) | 0;
          comp.push({ x: cx, y: cy });
          sumX += cx; sumY += cy;

          const neighbors = [cur - 1, cur + 1, cur - W, cur + W];
          for (const ni of neighbors) {
            const nx = ni % W, ny = (ni / W) | 0;
            if (ni >= 0 && ni < W * H && nx >= 0 && nx < W && ny >= 0 && ny < H
                && blurred[ni] > thresh && !visited[ni]) {
              visited[ni] = 1;
              queue.push(ni);
            }
          }
        }

        const area = comp.length;
        const distToCenter = Math.hypot(sumX / area - W / 2, sumY / area - H / 2);
        const score = area / (1 + distToCenter * 0.12);
        if (score > bestScore) { bestScore = score; bestComp = comp; }
      }
    }

    // ── 5. Four perspective corners (diagonal extremes) ───────────────────────
    let minSum = Infinity, maxSum = -Infinity;
    let minDiff = Infinity, maxDiff = -Infinity;

    // Default (full-frame fallback)
    let p1 = { x: W * 0.12, y: H * 0.08 };
    let p2 = { x: W * 0.88, y: H * 0.08 };
    let p3 = { x: W * 0.88, y: H * 0.92 };
    let p4 = { x: W * 0.12, y: H * 0.92 };

    for (const pt of bestComp) {
      const s = pt.x + pt.y, d = pt.x - pt.y;
      if (s < minSum) { minSum = s; p1 = pt; }
      if (s > maxSum) { maxSum = s; p3 = pt; }
      if (d > maxDiff) { maxDiff = d; p2 = pt; }
      if (d < minDiff) { minDiff = d; p4 = pt; }
    }

    // ── 6. Sobel corner refinement ────────────────────────────────────────────
    const refine = (pt: { x: number; y: number }, radius = 8) => {
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

    // ── 7. Validity check ─────────────────────────────────────────────────────
    const brightCount = bestComp.length;
    const frameArea   = W * H;

    // Bounding box of the quad
    const bx1 = Math.min(p1.x, p4.x), bx2 = Math.max(p2.x, p3.x);
    const by1 = Math.min(p1.y, p2.y), by2 = Math.max(p3.y, p4.y);
    const bw   = bx2 - bx1, bh = by2 - by1;
    const bboxAspect = bw / Math.max(1, bh);

    const confidence = Math.min(1, brightCount / (frameArea * 0.09));

    const isValid =
      brightCount > frameArea * 0.07 &&
      brightCount < frameArea * 0.97 &&
      bw > W * 0.18 && bh > H * 0.18 &&
      bboxAspect > 0.3 && bboxAspect < 3.0;

    if (isValid) {
      const toP = (pt: { x: number; y: number }) => ({
        x: (pt.x / W) * 100,
        y: (pt.y / H) * 100,
      });

      const raw: QuadPoints = {
        p1: toP(p1), p2: toP(p2), p3: toP(p3), p4: toP(p4),
      };

      // Exponential moving average
      const k = 0.55;
      const quad: QuadPoints = lastQuadRef.current
        ? {
            p1: { x: lastQuadRef.current.p1.x * k + raw.p1.x * (1-k), y: lastQuadRef.current.p1.y * k + raw.p1.y * (1-k) },
            p2: { x: lastQuadRef.current.p2.x * k + raw.p2.x * (1-k), y: lastQuadRef.current.p2.y * k + raw.p2.y * (1-k) },
            p3: { x: lastQuadRef.current.p3.x * k + raw.p3.x * (1-k), y: lastQuadRef.current.p3.y * k + raw.p3.y * (1-k) },
            p4: { x: lastQuadRef.current.p4.x * k + raw.p4.x * (1-k), y: lastQuadRef.current.p4.y * k + raw.p4.y * (1-k) },
          }
        : raw;

      lastQuadRef.current = quad;
      onDetection(quad, confidence);
    } else {
      lastQuadRef.current = null;
      onDetection(
        { p1: { x: 12, y: 8 }, p2: { x: 88, y: 8 }, p3: { x: 88, y: 92 }, p4: { x: 12, y: 92 } },
        0,
      );
    }

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
