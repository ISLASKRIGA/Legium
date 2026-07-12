import { createClient } from '@insforge/sdk';
import { Case } from './types';

const insforgeUrl = import.meta.env.VITE_INSFORGE_URL as string | undefined;
const insforgeAnonKey = import.meta.env.VITE_INSFORGE_ANON_KEY as string | undefined;

const hasConfig = !!(insforgeUrl && insforgeAnonKey);

export const insforge = hasConfig
  ? createClient({ baseUrl: insforgeUrl, anonKey: insforgeAnonKey })
  : null;

export const isInsforgeConfigured = () => hasConfig;

export const uploadPdfToInsforge = async (
  docId: string,
  pdfBlob: Blob,
  caseId: string
): Promise<string | null> => {
  if (!insforge) return null;
  const path = caseId + '/' + docId + '.pdf';
  const { data, error } = await insforge.storage
    .from('legal-documents')
    .upload(path, pdfBlob);
  if (error) {
    console.error('[InsForge Storage] Upload error:', error.message);
    return null;
  }
  const { data: urlData } = insforge.storage
    .from('legal-documents')
    .getPublicUrl(path);
  return urlData?.publicUrl ?? null;
};

export const saveCaseRecord = async (caseObj: Case): Promise<void> => {
  if (!insforge) return;
  const { error } = await insforge.database.from('cases').upsert([{
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
  }]);
  if (error) console.error('[InsForge] Case upsert error:', error.message);
};

export const saveDocumentRecord = async (doc: {
  id: string;
  caseId: string;
  name: string;
  sizeKb: number;
  uploadDate: string;
  ocrText: string;
  pdfUrl: string | null;
}): Promise<void> => {
  if (!insforge) return;
  const { error } = await insforge.database.from('documents').insert([{
    id: doc.id,
    case_id: doc.caseId,
    name: doc.name,
    size_kb: doc.sizeKb,
    upload_date: doc.uploadDate,
    ocr_text: doc.ocrText,
    pdf_url: doc.pdfUrl,
    pdf_key: doc.caseId + '/' + doc.id + '.pdf',
  }]);
  if (error) console.error('[InsForge] Document insert error:', error.message);
};

export const saveNotificationRecord = async (noti: {
  id: string;
  title: string;
  message: string;
  date: string;
  read: boolean;
  caseId?: string;
  targetRole?: string;
}): Promise<void> => {
  if (!insforge) return;
  const { error } = await insforge.database.from('notifications').insert([{
    id: noti.id,
    title: noti.title,
    message: noti.message,
    date: noti.date,
    read: noti.read,
    case_id: noti.caseId || null,
    target_role: noti.targetRole || null,
  }]);
  if (error) console.error('[InsForge] Notification insert error:', error.message);
};

export const getCasesFromInsforge = async (): Promise<Case[]> => {
  if (!insforge) return [];
  const { data, error } = await insforge.database.from('cases').select('*');
  if (error) {
    console.error('[InsForge] Error fetching cases:', error.message);
    return [];
  }
  return (data || []).map((row: any) => ({
    id: row.id,
    title: row.title,
    clientId: row.client_id,
    clientName: row.client_name,
    opposingParty: row.opposing_party,
    opposingLawyer: row.opposing_lawyer,
    practiceArea: row.practice_area,
    status: row.status,
    court: row.court,
    judge: row.judge,
    assignedLawyerId: row.assigned_lawyer_id,
    assignedLawyerName: row.assigned_lawyer_name,
    startDate: row.start_date,
    description: row.description,
    timeline: row.timeline || [],
    tasks: row.tasks || [],
    notes: row.notes || [],
    documents: []
  }));
};

export const getDocumentsFromInsforge = async (): Promise<any[]> => {
  if (!insforge) return [];
  const { data, error } = await insforge.database.from('documents').select('*');
  if (error) {
    console.error('[InsForge] Error fetching documents:', error.message);
    return [];
  }
  return data || [];
};

export const getNotificationsFromInsforge = async (): Promise<any[]> => {
  if (!insforge) return [];
  const { data, error } = await insforge.database.from('notifications').select('*');
  if (error) {
    console.error('[InsForge] Error fetching notifications:', error.message);
    return [];
  }
  return (data || []).map((row: any) => ({
    id: row.id,
    title: row.title,
    message: row.message,
    date: row.date,
    read: row.read,
    caseId: row.case_id,
    targetRole: row.target_role
  }));
};
