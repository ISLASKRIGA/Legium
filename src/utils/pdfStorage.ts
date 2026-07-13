const IDB_NAME = 'legium_pdfs';
const IDB_STORE = 'pdfs';
const PDF_STORAGE_PREFIX = 'legium_pdf_';

type PdfSessionWindow = Window & {
  pdfSessionUrls?: Map<string, string>;
};

const getSessionUrls = (): Map<string, string> => {
  const win = window as PdfSessionWindow;
  win.pdfSessionUrls = win.pdfSessionUrls || new Map<string, string>();
  return win.pdfSessionUrls;
};

// ── IndexedDB helpers ────────────────────────────────────────────────────────

let _dbPromise: Promise<IDBDatabase> | null = null;

const getDB = (): Promise<IDBDatabase> => {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbPromise;
};

const idbPut = async (key: string, blob: Blob): Promise<void> => {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(blob, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

const idbGet = async (key: string): Promise<Blob | null> => {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get(key);
    req.onsuccess = () => resolve((req.result as Blob) ?? null);
    req.onerror = () => reject(req.error);
  });
};

const idbDelete = async (key: string): Promise<void> => {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

// ── Public API ───────────────────────────────────────────────────────────────

export const getPdfStorageKey = (docId: string): string => PDF_STORAGE_PREFIX + docId;

/** Register an in-memory ObjectURL immediately so the PDF is viewable right away. */
export const registerPdfSession = (docId: string, blob: Blob): void => {
  const sessionUrls = getSessionUrls();
  const prev = sessionUrls.get(docId);
  if (prev) URL.revokeObjectURL(prev);
  sessionUrls.set(docId, URL.createObjectURL(blob));
};

/**
 * Save PDF blob to IndexedDB (persists across reloads, no size limit).
 * Also registers an in-memory ObjectURL for immediate access.
 * Awaiting this guarantees the blob is on disk before the caller continues.
 */
export const savePdfBlob = async (docId: string, blob: Blob): Promise<string> => {
  const storageKey = getPdfStorageKey(docId);
  registerPdfSession(docId, blob);
  await idbPut(storageKey, blob);
  return storageKey;
};

/**
 * Returns an ObjectURL for the blob, restoring it from IndexedDB if needed.
 * Returns null if the blob was never saved or has been deleted.
 */
export const getPdfObjectUrl = async (docId: string): Promise<string | null> => {
  const sessionUrls = getSessionUrls();
  const cached = sessionUrls.get(docId);
  if (cached) return cached;

  try {
    const blob = await idbGet(getPdfStorageKey(docId));
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    sessionUrls.set(docId, url);
    return url;
  } catch (e) {
    console.warn('[PDF] IndexedDB read failed:', e);
    return null;
  }
};

/**
 * Fetches a remote PDF, re-wraps it as a Blob with the correct 'application/pdf'
 * MIME type (InsForge storage serves uploads as 'binary/octet-stream', which stops
 * browsers from rendering the embedded PDF viewer), and caches it locally so
 * subsequent views are instant. Returns null if the fetch fails (e.g. offline, CORS).
 */
export const fetchRemotePdfAsObjectUrl = async (
  docId: string,
  remoteUrl: string
): Promise<string | null> => {
  try {
    const response = await fetch(remoteUrl);
    if (!response.ok) return null;
    const rawBlob = await response.blob();
    const pdfBlob = new Blob([rawBlob], { type: 'application/pdf' });
    await savePdfBlob(docId, pdfBlob);
    return await getPdfObjectUrl(docId);
  } catch (e) {
    console.warn('[PDF] Remote fetch failed:', e);
    return null;
  }
};

export const deletePdfBlob = async (docId: string): Promise<void> => {
  const sessionUrls = getSessionUrls();
  const cached = sessionUrls.get(docId);
  if (cached) {
    URL.revokeObjectURL(cached);
    sessionUrls.delete(docId);
  }
  await idbDelete(getPdfStorageKey(docId));
  // Also clean up any old localStorage entry from the previous implementation
  localStorage.removeItem(getPdfStorageKey(docId));
};
