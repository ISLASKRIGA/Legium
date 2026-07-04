export type UserRole = 'TI Administrador' | 'Socio Principal' | 'Abogado Senior' | 'Abogado Junior' | 'Cliente';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  active: boolean;
  avatar: string;
  clientId?: string;
}

export type ClientType = 'Corporativo' | 'Individual';

export interface Client {
  id: string;
  name: string;
  email: string;
  phone: string;
  type: ClientType;
  rfc: string;
  contactPerson: string;
}

export interface TimelineItem {
  date: string;
  title: string;
  desc: string;
  completed: boolean;
}

export interface TaskItem {
  id: string;
  title: string;
  dueDate: string;
  assignedTo: string;
  completed: boolean;
}

export interface NoteItem {
  id: string;
  date: string;
  author: string;
  text: string;
}

export interface DocumentItem {
  id: string;
  name: string;
  size: string;
  uploadDate: string;
  ocrText?: string;
  storageKey?: string;
}

export type CaseStatus = 'Activo' | 'En ApelaciÃ³n' | 'Cerrado' | 'Suspendido';
export type PracticeArea = 'Civil' | 'Penal' | 'Laboral' | 'Tributario' | 'Corporativo';

export interface Case {
  id: string;
  title: string;
  clientId: string;
  clientName: string;
  opposingParty: string;
  opposingLawyer: string;
  practiceArea: PracticeArea;
  status: CaseStatus;
  court: string;
  judge: string;
  assignedLawyerId: string;
  assignedLawyerName: string;
  startDate: string;
  description: string;
  timeline: TimelineItem[];
  tasks: TaskItem[];
  notes: NoteItem[];
  documents: DocumentItem[];
}

export interface AuditLog {
  timestamp: string;
  userId: string;
  userName: string;
  userRole: string;
  action: string;
  status: 'Success' | 'Warning' | 'Denied';
}

export interface FinancialSummary {
  totalRevenue: number;
  pendingPayments: number;
  totalExpenses: number;
  hoursBilledThisMonth: number;
}

export interface MonthlyRevenue {
  month: string;
  billed: number;
  collected: number;
}

export interface Financials {
  summary: FinancialSummary;
  monthlyRevenue: MonthlyRevenue[];
}

