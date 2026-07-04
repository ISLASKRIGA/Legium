import { useEffect, useRef, useCallback } from 'react';

export interface QuadPoints {
  p1: { x: number; y: number };
  p2: { x: number; y: number };
  p3: { x: number; y: number };
  p4: { x: number; y: number };
}

interface UseDocumentDetectionOptions {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  active: boolean;
  onDetection: (quad: QuadPoints, confidence: number) => void;
}

/**
 * Detects document boundaries in real-time from a video stream using canvas pixel analysis.
 * Algorithm:
 * 1. Draw video frame to an offscreen canvas at low resolution for performance
 * 2. Convert to grayscale
 * 3. Find the bounding region of bright pixels (document = white/light on darker background)
 * 4. Return the 4 corners as percentages of video dimensions
 *
 * Works best with: white/light documents on darker surfaces (table, desk, etc.)
 */
export function useDocumentDetection({
  videoRef,
  active,
  onDetection,
}: UseDocumentDetectionOptions) {
  const animFrameRef = useRef<number | null>(null);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);

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

    // Find average brightness to set adaptive threshold
    const avg = brightness.reduce((a, b) => a + b, 0) / brightness.length;
    const threshold = Math.min(avg * 1.15, 220); // document brighter than background

    // Scan for bounding box of bright region (the document)
    let minX = W, maxX = 0, minY = H, maxY = 0;
    let brightCount = 0;

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (brightness[y * W + x] > threshold) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
          brightCount++;
        }
      }
    }

    const docArea = (maxX - minX) * (maxY - minY);
    const frameArea = W * H;
    const confidence = Math.min(1, brightCount / (frameArea * 0.15));

    // Only report if the detected region is large enough to be a document
    // (at least 15% of frame area, not the whole frame)
    const isValid =
      docArea > frameArea * 0.1 &&
      docArea < frameArea * 0.97 &&
      (maxX - minX) > W * 0.15 &&
      (maxY - minY) > H * 0.15;

    if (isValid) {
      // Add some padding inward to hug the document edges
      const padX = (maxX - minX) * 0.03;
      const padY = (maxY - minY) * 0.03;

      const quad: QuadPoints = {
        p1: { x: ((minX + padX) / W) * 100, y: ((minY + padY) / H) * 100 },
        p2: { x: ((maxX - padX) / W) * 100, y: ((minY + padY) / H) * 100 },
        p3: { x: ((maxX - padX) / W) * 100, y: ((maxY - padY) / H) * 100 },
        p4: { x: ((minX + padX) / W) * 100, y: ((maxY - padY) / H) * 100 },
      };
      onDetection(quad, confidence);
    } else {
      // No clear document — return default wide frame
      onDetection(
        {
          p1: { x: 15, y: 10 },
          p2: { x: 85, y: 10 },
          p3: { x: 83, y: 90 },
          p4: { x: 17, y: 90 },
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
