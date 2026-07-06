import { useEffect, useRef, useCallback } from 'react';

export interface QuadPoints {
  p1: { x: number; y: number };
  p2: { x: number; y: number };
  p3: { x: number; y: number };
  p4: { x: number; y: number };
}

interface Point {
  x: number;
  y: number;
}

function refineCorner(brightness: number[], W: number, H: number, estimated: Point): Point {
  let bestX = estimated.x;
  let bestY = estimated.y;
  let maxGrad = -1;

  // Search window of size 10x10 around the estimated point
  const radius = 5;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const cx = estimated.x + dx;
      const cy = estimated.y + dy;

      if (cx > 1 && cx < W - 2 && cy > 1 && cy < H - 2) {
        // Sobel-like gradients in horizontal and vertical directions
        const gx = 
          (brightness[(cy - 1) * W + (cx + 1)] + 2 * brightness[cy * W + (cx + 1)] + brightness[(cy + 1) * W + (cx + 1)]) -
          (brightness[(cy - 1) * W + (cx - 1)] + 2 * brightness[cy * W + (cx - 1)] + brightness[(cy + 1) * W + (cx - 1)]);

        const gy = 
          (brightness[(cy + 1) * W + (cx - 1)] + 2 * brightness[(cy + 1) * W + cx] + brightness[(cy + 1) * W + (cx + 1)]) -
          (brightness[(cy - 1) * W + (cx - 1)] + 2 * brightness[(cy - 1) * W + cx] + brightness[(cy - 1) * W + (cx + 1)]);

        const mag = gx * gx + gy * gy;
        if (mag > maxGrad) {
          maxGrad = mag;
          bestX = cx;
          bestY = cy;
        }
      }
    }
  }

  return { x: bestX, y: bestY };
}

interface UseDocumentDetectionOptions {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  active: boolean;
  onDetection: (quad: QuadPoints, confidence: number) => void;
}

/**
 * Detects document boundaries in real-time from a video stream using extreme points detection.
 * Algorithm:
 * 1. Draw video frame to an offscreen canvas at low resolution for performance
 * 2. Convert to grayscale and threshold
 * 3. Find extreme points of the bright quadrilateral region:
 *    - Top-Left: minimizes x + y
 *    - Top-Right: maximizes x - y
 *    - Bottom-Right: maximizes x + y
 *    - Bottom-Left: minimizes x - y
 * 4. Apply a temporal low-pass filter to smooth coordinates and prevent jitter
 */
export function useDocumentDetection({
  videoRef,
  active,
  onDetection,
}: UseDocumentDetectionOptions) {
  const animFrameRef = useRef<number | null>(null);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastQuadRef = useRef<QuadPoints | null>(null);

  const detect = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || !active) {
      animFrameRef.current = requestAnimationFrame(detect);
      return;
    }

    // Work on a small 80×120 canvas for performance
    const W = 80;
    const H = 120;

    if (!offscreenCanvasRef.current) {
      offscreenCanvasRef.current = document.createElement('canvas');
      offscreenCanvasRef.current.width = W;
      offscreenCanvasRef.current.height = H;
    }

    const canvas = offscreenCanvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      animFrameRef.current = requestAnimationFrame(detect);
      return;
    }

    ctx.drawImage(video, 0, 0, W, H);
    const imageData = ctx.getImageData(0, 0, W, H);
    const data = imageData.data;

    // Build a brightness map
    const brightness: number[] = new Array(W * H);
    for (let i = 0; i < W * H; i++) {
      const r = data[i * 4];
      const g = data[i * 4 + 1];
      const b = data[i * 4 + 2];
      brightness[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    }

    // Noise Reduction: Apply 3x3 box blur to filter out text lines, keyboard keycaps, and specks
    const blurred: number[] = new Array(W * H);
    let minB = 255;
    let maxB = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let sum = 0;
        let count = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const ny = y + dy;
            const nx = x + dx;
            if (ny >= 0 && ny < H && nx >= 0 && nx < W) {
              sum += brightness[ny * W + nx];
              count++;
            }
          }
        }
        const val = sum / count;
        blurred[y * W + x] = val;
        if (val < minB) minB = val;
        if (val > maxB) maxB = val;
      }
    }

    // Dynamic Threshold: position at 58% of the range between darkest and brightest pixels
    const threshold = minB + (maxB - minB) * 0.58;

    // Extreme points for tilted quad
    let minSum = W + H, maxSum = 0;
    let minDiff = W + H, maxDiff = -W - H;
    let p1 = { x: 12, y: 12 };
    let p2 = { x: 68, y: 12 };
    let p3 = { x: 68, y: 108 };
    let p4 = { x: 12, y: 108 };
    let brightCount = 0;

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (blurred[y * W + x] > threshold) {
          const sum = x + y;
          const diff = x - y;

          if (sum < minSum) {
            minSum = sum;
            p1 = { x, y };
          }
          if (sum > maxSum) {
            maxSum = sum;
            p3 = { x, y };
          }
          if (diff > maxDiff) {
            maxDiff = diff;
            p2 = { x, y };
          }
          if (diff < minDiff) {
            minDiff = diff;
            p4 = { x, y };
          }
          brightCount++;
        }
      }
    }

    // Corner Refinement using Sobel edge gradients
    p1 = refineCorner(brightness, W, H, p1);
    p2 = refineCorner(brightness, W, H, p2);
    p3 = refineCorner(brightness, W, H, p3);
    p4 = refineCorner(brightness, W, H, p4);

    const minX = Math.min(p1.x, p4.x);
    const maxX = Math.max(p2.x, p3.x);
    const minY = Math.min(p1.y, p2.y);
    const maxY = Math.max(p3.y, p4.y);
    const docArea = (maxX - minX) * (maxY - minY);
    const frameArea = W * H;
    const confidence = Math.min(1, brightCount / (frameArea * 0.12));

    const isValid =
      docArea > frameArea * 0.08 &&
      docArea < frameArea * 0.98 &&
      (maxX - minX) > W * 0.15 &&
      (maxY - minY) > H * 0.15;

    if (isValid) {
      const padX = (maxX - minX) * 0.015;
      const padY = (maxY - minY) * 0.015;

      const rawQuad: QuadPoints = {
        p1: { x: ((p1.x + padX) / W) * 100, y: ((p1.y + padY) / H) * 100 },
        p2: { x: ((p2.x - padX) / W) * 100, y: ((p2.y + padY) / H) * 100 },
        p3: { x: ((p3.x - padX) / W) * 100, y: ((p3.y - padY) / H) * 100 },
        p4: { x: ((p4.x + padX) / W) * 100, y: ((p4.y - padY) / H) * 100 },
      };

      // Temporal smoothing low-pass filter
      let smoothedQuad: QuadPoints;
      if (lastQuadRef.current) {
        const last = lastQuadRef.current;
        const k = 0.65; // Smoothing weight
        smoothedQuad = {
          p1: { x: last.p1.x * k + rawQuad.p1.x * (1 - k), y: last.p1.y * k + rawQuad.p1.y * (1 - k) },
          p2: { x: last.p2.x * k + rawQuad.p2.x * (1 - k), y: last.p2.y * k + rawQuad.p2.y * (1 - k) },
          p3: { x: last.p3.x * k + rawQuad.p3.x * (1 - k), y: last.p3.y * k + rawQuad.p3.y * (1 - k) },
          p4: { x: last.p4.x * k + rawQuad.p4.x * (1 - k), y: last.p4.y * k + rawQuad.p4.y * (1 - k) },
        };
      } else {
        smoothedQuad = rawQuad;
      }

      lastQuadRef.current = smoothedQuad;
      onDetection(smoothedQuad, confidence);
    } else {
      // Default crop frame
      onDetection(
        {
          p1: { x: 12, y: 10 },
          p2: { x: 88, y: 10 },
          p3: { x: 86, y: 90 },
          p4: { x: 14, y: 90 },
        },
        0
      );
    }

    animFrameRef.current = requestAnimationFrame(detect);
  }, [videoRef, active, onDetection]);

  useEffect(() => {
    if (active) {
      animFrameRef.current = requestAnimationFrame(detect);
    }
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [active, detect]);
}
