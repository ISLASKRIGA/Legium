import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

// Warn in dev if not configured yet
if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '[Legium] Supabase not configured. Create a .env file with:\n' +
    'VITE_SUPABASE_URL=https://xxxx.supabase.co\n' +
    'VITE_SUPABASE_ANON_KEY=eyJ...'
  );
}

export const supabase = (supabaseUrl && supabaseAnonKey)
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export const isSupabaseConfigured = () => !!supabase;

/**
 * Upload a PDF blob to Supabase Storage.
 * Returns the public URL or null if Supabase is not configured.
 */
export const uploadPdfToSupabase = async (
  docId: string,
  pdfBlob: Blob,
  caseId: string
): Promise<string | null> => {
  if (!supabase) return null;
  const path = `${caseId}/${docId}.pdf`;
  const { error } = await supabase.storage
    .from('legal-documents')
    .upload(path, pdfBlob, { contentType: 'application/pdf', upsert: true });
  if (error) {
    console.error('[Supabase Storage] Upload error:', error.message);
    return null;
  }
  const { data } = supabase.storage.from('legal-documents').getPublicUrl(path);
  return data?.publicUrl ?? null;
};

/**
 * Save a document record to the Supabase documents table.
 */
export const saveDocumentRecord = async (doc: {
  id: string;
  caseId: string;
  name: string;
  sizeKb: number;
  uploadDate: string;
  ocrText: string;
  pdfUrl: string | null;
}) => {
  if (!supabase) return;
  const { error } = await supabase.from('documents').insert({
    id: doc.id,
    case_id: doc.caseId,
    name: doc.name,
    size_kb: doc.sizeKb,
    upload_date: doc.uploadDate,
    ocr_text: doc.ocrText,
    pdf_url: doc.pdfUrl,
  });
  if (error) console.error('[Supabase] Document insert error:', error.message);
};
