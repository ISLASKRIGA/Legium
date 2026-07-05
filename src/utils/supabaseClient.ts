import { createClient } from '@supabase/supabase-js';
import { Case } from './types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

const isConfiguredValue = (value: string | undefined) => {
  if (!value) return false;
  return !value.includes('REEMPLAZA_CON_TU') && !value.includes('xxxx.supabase.co');
};

const hasSupabaseConfig = isConfiguredValue(supabaseUrl) && isConfiguredValue(supabaseAnonKey);

if (!hasSupabaseConfig && import.meta.env.DEV) {
  console.warn(
    '[Legium] Supabase no está configurado. Crea un archivo .env con:\n' +
    'VITE_SUPABASE_URL=https://xxxx.supabase.co\n' +
    'VITE_SUPABASE_ANON_KEY=eyJ...'
  );
}

export const supabase = hasSupabaseConfig
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export const isSupabaseConfigured = () => hasSupabaseConfig;

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
  const path = caseId + '/' + docId + '.pdf';
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
 * Save or update a case record in the Supabase cases table.
 */
export const saveCaseRecord = async (caseObj: Case): Promise<void> => {
  if (!supabase) return;
  const { error } = await supabase.from('cases').upsert({
    id: caseObj.id,
    title: caseObj.title,
    client_id: caseObj.clientId,
    client_name: caseObj.clientName,
    opposing_party: caseObj.opposingParty,
    opposing_lawyer: caseObj.opposingLawyer,
    practice_area: caseObj.practiceArea,
    status: caseObj.status,
    court: caseObj.court,
    judge: caseObj.judge,
    assigned_lawyer_id: caseObj.assignedLawyerId,
    assigned_lawyer_name: caseObj.assignedLawyerName,
    start_date: caseObj.startDate,
    description: caseObj.description,
    timeline: caseObj.timeline,
    tasks: caseObj.tasks,
    notes: caseObj.notes,
  });
  if (error) {
    console.error('[Supabase] Case upsert error:', error.message);
  }
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