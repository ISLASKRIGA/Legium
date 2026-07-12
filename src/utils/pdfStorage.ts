const PDF_STORAGE_PREFIX = 'legium_pdf_';

type PdfSessionWindow = Window & {
  pdfSessionUrls?: Map<string, string>;
};

const getSessionUrls = (): Map<string, string> => {
  const win = window as PdfSessionWindow;
  win.pdfSessionUrls = win.pdfSessionUrls || new Map<string, string>();
  return win.pdfSessionUrls;
};

const blobToDataUrl = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
};

const dataUrlToBlob = (dataUrl: string): Blob => {
  const [meta, base64] = dataUrl.split(',');
  const mime = meta.match(/data:(.*);base64/)?.[1] || 'application/pdf';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return new Blob([bytes], { type: mime });
};

export const getPdfStorageKey = (docId: string): string => PDF_STORAGE_PREFIX + docId;

// Register blob in session immediately (sync) so it's viewable right away
export const registerPdfSession = (docId: string, blob: Blob): void => {
  const sessionUrls = getSessionUrls();
  const prev = sessionUrls.get(docId);
  if (prev) URL.revokeObjectURL(prev);
  sessionUrls.set(docId, URL.createObjectURL(blob));
};

export const savePdfBlob = async (docId: string, blob: Blob): Promise<string> => {
  const storageKey = getPdfStorageKey(docId);

  // Register ObjectURL immediately so it's viewable right away
  registerPdfSession(docId, blob);

  // Persist to localStorage — must complete before returning so the caller
  // can safely reload the page and still find the blob.
  try {
    const dataUrl = await blobToDataUrl(blob);
    localStorage.setItem(storageKey, dataUrl);
  } catch (e) {
    console.warn('[PDF] localStorage save failed:', e);
  }

  return storageKey;
};

export const getPdfObjectUrl = (docId: string): string | null => {
  const sessionUrls = getSessionUrls();
  const cachedUrl = sessionUrls.get(docId);
  if (cachedUrl) return cachedUrl;

  const storedDataUrl = localStorage.getItem(getPdfStorageKey(docId));
  if (!storedDataUrl) return null;

  const objectUrl = URL.createObjectURL(dataUrlToBlob(storedDataUrl));
  sessionUrls.set(docId, objectUrl);
  return objectUrl;
};

export const deletePdfBlob = (docId: string): void => {
  const sessionUrls = getSessionUrls();
  const cachedUrl = sessionUrls.get(docId);
  if (cachedUrl) {
    URL.revokeObjectURL(cachedUrl);
    sessionUrls.delete(docId);
  }
  localStorage.removeItem(getPdfStorageKey(docId));
};

