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
