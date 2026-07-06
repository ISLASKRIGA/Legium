import { jsPDF } from 'jspdf';

export interface CroppedImageResult {
  dataUrl: string;
  width: number;
  height: number;
}

export interface CropBox {
  top: number;
  left: number;
  width: number;
  height: number;
}

export const DEFAULT_SCANNED_OCR_TEXT = [
  'Documento escaneado e indexado por OCR en Legium.',
  'El archivo contiene imagen original del documento y capa de texto buscable para consulta en expediente digital.',
  'Fecha de digitalizacion: ' + new Date().toISOString().split('T')[0]
].join('\n');

export const cropImage = (
  imageDataUrl: string,
  cropBox: CropBox,
  filter: string = 'none',
  quality: number = 0.88
): Promise<CroppedImageResult> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('No se pudo preparar el lienzo de escaneo.'));
        return;
      }

      const startX = (cropBox.left / 100) * img.width;
      const startY = (cropBox.top / 100) * img.height;
      const cropW = (cropBox.width / 100) * img.width;
      const cropH = (cropBox.height / 100) * img.height;

      canvas.width = cropW;
      canvas.height = cropH;
      ctx.filter = filter;
      ctx.drawImage(img, startX, startY, cropW, cropH, 0, 0, cropW, cropH);

      resolve({
        dataUrl: canvas.toDataURL('image/jpeg', quality),
        width: cropW,
        height: cropH
      });
    };
    img.onerror = () => reject(new Error('No se pudo cargar la imagen capturada.'));
    img.src = imageDataUrl;
  });
};

export const createSearchablePdf = (image: CroppedImageResult, ocrText: string): Blob => {
  const pdf = new jsPDF({
    orientation: image.width > image.height ? 'landscape' : 'portrait',
    unit: 'px',
    format: [image.width, image.height]
  });

  const text = ocrText.trim() || DEFAULT_SCANNED_OCR_TEXT;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(Math.max(8, Math.min(16, image.width / 55)));
  pdf.setTextColor(255, 255, 255);

  const margin = Math.max(18, image.width * 0.04);
  const lines = pdf.splitTextToSize(text, Math.max(40, image.width - margin * 2));
  pdf.text(lines, margin, margin + 10, {
    baseline: 'top',
    lineHeightFactor: 1.25
  });

  pdf.addImage(image.dataUrl, 'JPEG', 0, 0, image.width, image.height);
  return pdf.output('blob');
};

export interface Point {
  x: number;
  y: number;
}

export interface QuadPoints {
  p1: Point;
  p2: Point;
  p3: Point;
  p4: Point;
}

// Solves AX = B using Gaussian elimination
function solveGaussian(A: number[][], B: number[]): number[] {
  const n = A.length;
  for (let i = 0; i < n; i++) {
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(A[k][i]) > Math.abs(A[maxRow][i])) {
        maxRow = k;
      }
    }
    const tempA = A[i];
    A[i] = A[maxRow];
    A[maxRow] = tempA;
    const tempB = B[i];
    B[i] = B[maxRow];
    B[maxRow] = tempB;

    for (let k = i + 1; k < n; k++) {
      const factor = A[k][i] / A[i][i];
      for (let j = i; j < n; j++) {
        A[k][j] -= factor * A[i][j];
      }
      B[k] -= factor * B[i];
    }
  }

  const X = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let sum = B[i];
    for (let j = i + 1; j < n; j++) {
      sum -= A[i][j] * X[j];
    }
    X[i] = sum / A[i][i];
  }
  return X;
}

export const warpPerspective = (
  imageDataUrl: string,
  quad: QuadPoints,
  targetWidth: number = 800,
  targetHeight: number = 1100
): Promise<{ dataUrl: string; width: number; height: number }> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('No se pudo inicializar el contexto 2D para warping.'));
        return;
      }

      // We need to read pixels of source image
      const srcCanvas = document.createElement('canvas');
      srcCanvas.width = img.width;
      srcCanvas.height = img.height;
      const srcCtx = srcCanvas.getContext('2d');
      if (!srcCtx) {
        reject(new Error('No se pudo inicializar el canvas origen.'));
        return;
      }
      srcCtx.drawImage(img, 0, 0);
      const srcData = srcCtx.getImageData(0, 0, img.width, img.height);
      const destData = ctx.createImageData(targetWidth, targetHeight);

      // Extract points in pixel coordinates
      const x0 = (quad.p1.x / 100) * img.width;
      const y0 = (quad.p1.y / 100) * img.height;
      const x1 = (quad.p2.x / 100) * img.width;
      const y1 = (quad.p2.y / 100) * img.height;
      const x2 = (quad.p3.x / 100) * img.width;
      const y2 = (quad.p3.y / 100) * img.height;
      const x3 = (quad.p4.x / 100) * img.width;
      const y3 = (quad.p4.y / 100) * img.height;

      const w = targetWidth;
      const h = targetHeight;

      // Set up matrix equation to find transformation coefficients from destination (u, v) back to source (x, y)
      // x = (a0*u + a1*v + a2) / (a6*u + a7*v + 1)
      // y = (a3*u + a4*v + a5) / (a6*u + a7*v + 1)
      const A = [
        [0, 0, 1, 0, 0, 0, 0, 0], // u0=0, v0=0 => x0 = a2
        [0, 0, 0, 0, 0, 1, 0, 0], // u0=0, v0=0 => y0 = a5
        [w, 0, 1, 0, 0, 0, -w * x1, 0], // u1=w, v1=0
        [0, 0, 0, w, 0, 1, -w * y1, 0],
        [w, h, 1, 0, 0, 0, -w * x2, -h * x2], // u2=w, v2=h
        [0, 0, 0, w, h, 1, -w * y2, -h * y2],
        [0, h, 1, 0, 0, 0, 0, -h * x3], // u3=0, v3=h
        [0, 0, 0, 0, h, 1, 0, -h * y3],
      ];

      const B = [x0, y0, x1, y1, x2, y2, x3, y3];

      let coeffs: number[];
      try {
        coeffs = solveGaussian(A, B);
        if (!coeffs || coeffs.some(c => isNaN(c) || !isFinite(c))) {
          throw new Error('NaN or Infinite coefficients in solved system');
        }
      } catch (err) {
        console.warn('Perspective warp failed, using fallback copy:', err);
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
        resolve({
          dataUrl: canvas.toDataURL('image/jpeg', 0.9),
          width: targetWidth,
          height: targetHeight
        });
        return;
      }

      const [a0, a1, a2, a3, a4, a5, a6, a7] = coeffs;

      const sData = srcData.data;
      const dData = destData.data;
      const sw = img.width;
      const sh = img.height;

      // Map each destination pixel (u, v) back to source (x, y)
      for (let v = 0; v < h; v++) {
        for (let u = 0; u < w; u++) {
          const denom = a6 * u + a7 * v + 1;
          const x = (a0 * u + a1 * v + a2) / denom;
          const y = (a3 * u + a4 * v + a5) / denom;

          // Bilinear interpolation
          if (x >= 0 && x < sw - 1 && y >= 0 && y < sh - 1) {
            const xFloor = Math.floor(x);
            const yFloor = Math.floor(y);
            const xWeight = x - xFloor;
            const yWeight = y - yFloor;

            const idx00 = (yFloor * sw + xFloor) * 4;
            const idx10 = (yFloor * sw + (xFloor + 1)) * 4;
            const idx01 = ((yFloor + 1) * sw + xFloor) * 4;
            const idx11 = ((yFloor + 1) * sw + (xFloor + 1)) * 4;

            const destIdx = (v * w + u) * 4;

            for (let c = 0; c < 4; c++) {
              const val =
                sData[idx00 + c] * (1 - xWeight) * (1 - yWeight) +
                sData[idx10 + c] * xWeight * (1 - yWeight) +
                sData[idx01 + c] * (1 - xWeight) * yWeight +
                sData[idx11 + c] * xWeight * yWeight;
              dData[destIdx + c] = val;
            }
          } else {
            // Out of bounds - fill with white
            const destIdx = (v * w + u) * 4;
            dData[destIdx] = 255;
            dData[destIdx + 1] = 255;
            dData[destIdx + 2] = 255;
            dData[destIdx + 3] = 255;
          }
        }
      }

      ctx.putImageData(destData, 0, 0);
      resolve({
        dataUrl: canvas.toDataURL('image/jpeg', 0.9),
        width: targetWidth,
        height: targetHeight
      });
    };

    img.onerror = () => reject(new Error('No se pudo cargar la imagen capturada para transformarla.'));
    img.src = imageDataUrl;
  });
};

export function detectDocumentEdges(img: HTMLImageElement): QuadPoints {
  const W = 80;
  const H = 120;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return {
      p1: { x: 15, y: 10 },
      p2: { x: 85, y: 10 },
      p3: { x: 83, y: 90 },
      p4: { x: 17, y: 90 }
    };
  }
  ctx.drawImage(img, 0, 0, W, H);
  const imageData = ctx.getImageData(0, 0, W, H);
  const data = imageData.data;

  // Build brightness map
  const brightness: number[] = new Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    brightness[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }

  const avg = brightness.reduce((a, b) => a + b, 0) / brightness.length;
  const threshold = Math.min(avg * 1.18, 215);

  let minSum = W + H, maxSum = 0;
  let minDiff = W + H, maxDiff = -W - H;
  let p1 = { x: 15, y: 10 };
  let p2 = { x: 85, y: 10 };
  let p3 = { x: 85, y: 90 };
  let p4 = { x: 15, y: 90 };
  let brightCount = 0;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (brightness[y * W + x] > threshold) {
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

  const minX = Math.min(p1.x, p4.x);
  const maxX = Math.max(p2.x, p3.x);
  const minY = Math.min(p1.y, p2.y);
  const maxY = Math.max(p3.y, p4.y);
  const docArea = (maxX - minX) * (maxY - minY);
  const frameArea = W * H;
  const isValid =
    docArea > frameArea * 0.08 &&
    docArea < frameArea * 0.98 &&
    (maxX - minX) > W * 0.15 &&
    (maxY - minY) > H * 0.15;

  if (isValid) {
    const padX = (maxX - minX) * 0.015;
    const padY = (maxY - minY) * 0.015;
    return {
      p1: { x: ((p1.x + padX) / W) * 100, y: ((p1.y + padY) / H) * 100 },
      p2: { x: ((p2.x - padX) / W) * 100, y: ((p2.y + padY) / H) * 100 },
      p3: { x: ((p3.x - padX) / W) * 100, y: ((p3.y - padY) / H) * 100 },
      p4: { x: ((p4.x + padX) / W) * 100, y: ((p4.y - padY) / H) * 100 }
    };
  }

  return {
    p1: { x: 12, y: 12 },
    p2: { x: 88, y: 12 },
    p3: { x: 86, y: 88 },
    p4: { x: 14, y: 88 }
  };
}


