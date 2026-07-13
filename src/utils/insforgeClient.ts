import { createClient } from '@insforge/sdk';
import { Case, User } from './types';

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

export const authenticateUserInsforge = async (
  username: string,
  password: string
): Promise<User | null> => {
  if (!insforge) return null;
  const { data, error } = await insforge.database
    .from('users')
    .select('*')
    .eq('username', username)
    .eq('password', password);
  if (error) {
    console.error('[InsForge] Auth query error:', error.message);
    return null;
  }
  const row = (data || [])[0];
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    active: row.active,
    avatar: row.avatar,
    clientId: row.client_id || undefined,
    username: row.username,
  };
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

const NOTIFICATIONS_CHANNEL = 'legium-notifications';
const NOTIFICATION_EVENT = 'notification:new';

/**
 * InsForge's realtime websocket requires a genuine InsForge Auth JWT (the
 * anon key alone is rejected with "Invalid token") — but this app's login
 * validates against our own `users` table, not InsForge Auth. To unlock
 * realtime without changing the login UX, silently sign in to InsForge Auth
 * behind the scenes using the same email/password, registering the account
 * on first use. Failures are non-fatal: the app still works, just without
 * push notifications (the 10s poll in App.tsx remains as a fallback).
 */
export const ensureRealtimeSession = async (email: string, password: string): Promise<void> => {
  if (!insforge || !email || !password) return;
  try {
    const { error: signInError } = await insforge.auth.signInWithPassword({ email, password });
    if (signInError) {
      await insforge.auth.signUp({ email, password, autoConfirm: true });
    }
  } catch (err) {
    console.warn('[InsForge Realtime] Could not establish an auth session for realtime:', err);
  }
};

export type RealtimeNotification = {
  id: string;
  title: string;
  message: string;
  date: string;
  read: boolean;
  caseId?: string;
  targetRole?: string;
};

/** Push a just-created notification to any live sessions listening on the shared channel. */
export const publishNotificationRealtime = async (noti: RealtimeNotification): Promise<void> => {
  if (!insforge) return;
  try {
    await insforge.realtime.subscribe(NOTIFICATIONS_CHANNEL);
    await insforge.realtime.publish(NOTIFICATIONS_CHANNEL, NOTIFICATION_EVENT, noti);
  } catch (err) {
    console.warn('[InsForge Realtime] Publish failed:', err);
  }
};

/**
 * Subscribe to live notification pushes. Returns an unsubscribe function.
 * No-op (returns a no-op cleanup) when InsForge isn't configured.
 */
export const subscribeToNotifications = (
  onNotification: (noti: RealtimeNotification) => void
): (() => void) => {
  if (!insforge) return () => {};
  const client = insforge;

  const handler = (message: any) => {
    // The server wraps custom publish() payloads in a SocketMessage envelope;
    // unwrap defensively since the exact nesting isn't part of the public types.
    const data = message && typeof message === 'object' && 'payload' in message
      ? message.payload
      : message;
    if (data && typeof data === 'object' && data.id) {
      onNotification(data as RealtimeNotification);
    }
  };

  const trySubscribe = () => {
    client.realtime.subscribe(NOTIFICATIONS_CHANNEL).catch((err) => {
      console.warn('[InsForge Realtime] Subscribe failed:', err);
    });
  };

  client.realtime.on(NOTIFICATION_EVENT, handler);
  // Re-subscribe on every (re)connect — covers the case where the first
  // connect attempt races ahead of ensureRealtimeSession() and gets rejected
  // with the anon-key token; once the auth session lands, the socket
  // reconnects with a valid token and this fires again.
  client.realtime.on('connect', trySubscribe);
  trySubscribe();

  return () => {
    client.realtime.off(NOTIFICATION_EVENT, handler);
    client.realtime.off('connect', trySubscribe);
    client.realtime.unsubscribe(NOTIFICATIONS_CHANNEL);
  };
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
