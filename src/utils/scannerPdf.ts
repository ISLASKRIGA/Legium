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

/** Creates a multi-page PDF from an array of scanned page images.
 *  OCR text is embedded as invisible white text on page 1 for searchability. */
export const createMultiPagePdf = (pages: CroppedImageResult[], ocrText: string): Blob => {
  if (pages.length === 0) throw new Error('No pages to render');

  const first = pages[0];
  const pdf = new jsPDF({
    orientation: first.width > first.height ? 'landscape' : 'portrait',
    unit: 'px',
    format: [first.width, first.height]
  });

  pages.forEach((page, index) => {
    if (index > 0) {
      pdf.addPage(
        [page.width, page.height],
        page.width > page.height ? 'landscape' : 'portrait'
      );
    }

    // Embed invisible OCR text on the first page only
    if (index === 0) {
      const text = ocrText.trim() || DEFAULT_SCANNED_OCR_TEXT;
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(Math.max(8, Math.min(16, page.width / 55)));
      pdf.setTextColor(255, 255, 255);
      const margin = Math.max(18, page.width * 0.04);
      const lines = pdf.splitTextToSize(text, Math.max(40, page.width - margin * 2));
      pdf.text(lines, margin, margin + 10, { baseline: 'top', lineHeightFactor: 1.25 });
    }

    pdf.addImage(page.dataUrl, 'JPEG', 0, 0, page.width, page.height);
  });

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

function detectSkewAngle(data: Uint8ClampedArray, w: number, h: number): number {
  // Downsample for performance (max width 160)
  const scale = Math.min(1.0, 160 / w);
  const sw = Math.round(w * scale);
  const sh = Math.round(h * scale);
  
  // Compute luminance
  const lum = new Float32Array(sw * sh);
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const srcX = Math.round(x / scale);
      const srcY = Math.round(y / scale);
      const idx = (Math.min(h - 1, srcY) * w + Math.min(w - 1, srcX)) * 4;
      lum[y * sw + x] = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
    }
  }

  // Find angle that maximizes projection variance
  let bestAngle = 0;
  let maxVariance = -1;

  for (let angleDeg = -8; angleDeg <= 8; angleDeg += 0.5) {
    const angleRad = (angleDeg * Math.PI) / 180;
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);

    const profile = new Float32Array(sh);
    const counts = new Int32Array(sh);
    const cx = sw / 2;
    const cy = sh / 2;

    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        const rx = x - cx;
        const ry = y - cy;
        const rotY = Math.round(rx * sin + ry * cos + cy);
        if (rotY >= 0 && rotY < sh) {
          profile[rotY] += lum[y * sw + x];
          counts[rotY]++;
        }
      }
    }

    let sum = 0;
    let sumSq = 0;
    let validRows = 0;
    for (let i = 0; i < sh; i++) {
      if (counts[i] > 0) {
        const avg = profile[i] / counts[i];
        sum += avg;
        sumSq += avg * avg;
        validRows++;
      }
    }

    if (validRows > 0) {
      const mean = sum / validRows;
      const variance = (sumSq / validRows) - (mean * mean);
      if (variance > maxVariance) {
        maxVariance = variance;
        bestAngle = angleDeg;
      }
    }
  }

  return bestAngle;
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

      // Detect and correct skew automatically
      try {
        const skewAngle = detectSkewAngle(destData.data, targetWidth, targetHeight);
        if (Math.abs(skewAngle) > 0.3) {
          const angleRad = (-skewAngle * Math.PI) / 180;
          const rotCanvas = document.createElement('canvas');
          rotCanvas.width = targetWidth;
          rotCanvas.height = targetHeight;
          const rotCtx = rotCanvas.getContext('2d');
          if (rotCtx) {
            rotCtx.fillStyle = '#ffffff';
            rotCtx.fillRect(0, 0, targetWidth, targetHeight);
            rotCtx.translate(targetWidth / 2, targetHeight / 2);
            rotCtx.rotate(angleRad);
            rotCtx.drawImage(canvas, -targetWidth / 2, -targetHeight / 2);

            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, targetWidth, targetHeight);
            ctx.drawImage(rotCanvas, 0, 0);
          }
        }
      } catch (e) {
        console.warn('Automatic deskewing failed:', e);
      }

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

      // Ensure we are inside bounds safely
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

export function detectDocumentEdges(img: HTMLImageElement): QuadPoints {
  const W = 80;
  const H = 120;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return {
      p1: { x: 12, y: 12 },
      p2: { x: 88, y: 12 },
      p3: { x: 86, y: 88 },
      p4: { x: 14, y: 88 }
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

  // Noise Reduction: Apply 5x5 box blur to completely filter out text lines, shadows, and keyboard keycaps
  const blurred: number[] = new Array(W * H);
  let minB = 255;
  let maxB = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let sum = 0;
      let count = 0;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
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

  // Dynamic Threshold: position at 56% between min and max brightness
  const threshold = minB + (maxB - minB) * 0.56;

  // Find connected components of pixels above threshold
  const visited = new Uint8Array(W * H);
  let bestComponent: { x: number; y: number }[] = [];
  let bestScore = -1;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const idx = y * W + x;
      if (blurred[idx] > threshold && !visited[idx]) {
        const comp: { x: number; y: number }[] = [];
        const queue: number[] = [idx];
        visited[idx] = 1;

        let sumX = 0;
        let sumY = 0;

        let qHead = 0;
        while (qHead < queue.length) {
          const curr = queue[qHead++];
          const cx = curr % W;
          const cy = Math.floor(curr / W);
          comp.push({ x: cx, y: cy });
          sumX += cx;
          sumY += cy;

          const neighbors = [
            { x: cx - 1, y: cy },
            { x: cx + 1, y: cy },
            { x: cx, y: cy - 1 },
            { x: cx, y: cy + 1 }
          ];

          for (const n of neighbors) {
            if (n.x >= 0 && n.x < W && n.y >= 0 && n.y < H) {
              const nIdx = n.y * W + n.x;
              if (blurred[nIdx] > threshold && !visited[nIdx]) {
                visited[nIdx] = 1;
                queue.push(nIdx);
              }
            }
          }
        }

        const area = comp.length;
        const centerX = sumX / area;
        const centerY = sumY / area;
        const distToFrameCenter = Math.hypot(centerX - W / 2, centerY - H / 2);
        
        const score = area / (1.0 + distToFrameCenter * 0.22);
        if (score > bestScore) {
          bestScore = score;
          bestComponent = comp;
        }
      }
    }
  }

  let minSum = W + H, maxSum = 0;
  let minDiff = W + H, maxDiff = -W - H;
  let p1 = { x: 12, y: 12 };
  let p2 = { x: 68, y: 12 };
  let p3 = { x: 68, y: 108 };
  let p4 = { x: 12, y: 108 };

  if (bestComponent.length > 0) {
    for (const pt of bestComponent) {
      const sum = pt.x + pt.y;
      const diff = pt.x - pt.y;

      if (sum < minSum) {
        minSum = sum;
        p1 = pt;
      }
      if (sum > maxSum) {
        maxSum = sum;
        p3 = pt;
      }
      if (diff > maxDiff) {
        maxDiff = diff;
        p2 = pt;
      }
      if (diff < minDiff) {
        minDiff = diff;
        p4 = pt;
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
      p4: { x: ((p4.x + padX) / W) * 100, y: ((p4.y - padY) / H) * 100 },
    };
  }

  return {
    p1: { x: 12, y: 10 },
    p2: { x: 88, y: 10 },
    p3: { x: 86, y: 90 },
    p4: { x: 14, y: 90 },
  };
}
