import { User, Client, Case, AuditLog, Financials, Notification } from './types';

export const DEFAULT_USERS: User[] = [
  { id: "usr-01", name: "Dr. Carlos Mendoza", email: "carlos.mendoza@legium.law", role: "Socio Principal", active: true, avatar: "CM" },
  { id: "usr-02", name: "Dra. Sofía Valenzuela", email: "sofia.valenzuela@legium.law", role: "Abogado Senior", active: true, avatar: "SV" },
  { id: "usr-03", name: "Lic. Mateo Ríos", email: "mateo.rios@legium.law", role: "Abogado Junior", active: true, avatar: "MR" },
  { id: "usr-04", name: "Ing. Alejandro Torres", email: "alejandro.torres@legium.law", role: "TI Administrador", active: true, avatar: "AT" },
  { id: "usr-05", name: "Dra. Valentina Paz", email: "valentina.paz@legium.law", role: "Abogado Senior", active: false, avatar: "VP" },
  { id: "usr-06", name: "Ing. Luis Fuentes", email: "lfuentes@constructoraalfa.com", role: "Cliente", active: true, avatar: "LF", clientId: "cli-01" }
];

export const DEFAULT_CLIENTS: Client[] = [
  { id: "cli-01", name: "Constructora Alfa S.A.", email: "legal@constructoraalfa.com", phone: "+56 9 8765 4321", type: "Corporativo", rfc: "CALF900812-A10", contactPerson: "Ing. Luis Fuentes" },
  { id: "cli-02", name: "Inversiones del Norte S.A.S.", email: "contacto@inversionesnorte.cl", phone: "+56 9 1234 5678", type: "Corporativo", rfc: "INOR150320-TX9", contactPerson: "Sra. Clara Belmar" },
  { id: "cli-03", name: "BioTecno Labs S.A.", email: "patentes@biotecnolabs.com", phone: "+56 2 2456 7890", type: "Corporativo", rfc: "BLAB201105-3R8", contactPerson: "Dr. Hugo Valencia" },
  { id: "cli-04", name: "Servicios de Retail Express Ltda.", email: "legal@retailexpress.cl", phone: "+56 9 9988 7766", type: "Corporativo", rfc: "REXP750614-XYZ", contactPerson: "Sra. María Elena Gómez" },
  { id: "cli-05", name: "Distribuidora Logística Rápida S.A.", email: "legal@logisticalrapida.cl", phone: "+56 9 5544 3322", type: "Corporativo", rfc: "LRAP820921-H22", contactPerson: "Don Roberto Díaz" },
  { id: "cli-06", name: "Agrícola Ganadera El Campo S.A.", email: "legal@ganaderaelcampo.cl", phone: "+56 9 4433 2211", type: "Corporativo", rfc: "CAMP880402-K99", contactPerson: "Don Andrés Larraín" }
];

export const DEFAULT_CASES: Case[] = [
  {
    id: "LEG-2026-001",
    title: "Tutela por Accidente del Trabajo - Rojas vs. Alfa",
    clientId: "cli-01",
    clientName: "Constructora Alfa S.A.",
    opposingParty: "Eduardo Rojas Muñoz (Ex Carpintero)",
    opposingLawyer: "Estudio Jurídico Silva & Asociados",
    practiceArea: "Laboral",
    status: "Activo",
    court: "2° Juzgado de Letras del Trabajo de Santiago",
    judge: "Dra. Patricia Ortiz",
    assignedLawyerId: "usr-01",
    assignedLawyerName: "Dr. Carlos Mendoza",
    startDate: "2026-01-15",
    description: "Defensa corporativa frente a demanda de tutela laboral por accidente laboral grave en obra de Colina. El trabajador reclama indemnización por daño moral por la suma de $45.000.000 CLP alegando falta de medidas de protección.",
    timeline: [
      { date: "2026-01-15", title: "Ingreso de Demanda", desc: "Se notifica la demanda de tutela en las oficinas centrales de Alfa.", completed: true },
      { date: "2026-02-04", title: "Contestación de Demanda", desc: "Se contesta negando la negligencia laboral y acreditando entrega de EPP.", completed: true },
      { date: "2026-03-01", title: "Inspección de Faena", desc: "La Inspección del Trabajo evacúa informe favorable de condiciones de seguridad.", completed: true },
      { date: "2026-06-25", title: "Audiencia Preparatoria", desc: "Fijación del objeto del juicio y ofrecimiento de pruebas.", completed: false },
      { date: "2026-07-20", title: "Audiencia de Juicio", desc: "Juicio oral y declaración de peritos y testigos.", completed: false }
    ],
    tasks: [
      { id: "tsk-001", title: "Preparar minuta y carpetas de entrega de EPP", dueDate: "2026-06-23", assignedTo: "usr-02", completed: false },
      { id: "tsk-002", title: "Coordinar declaración de prevencionista de riesgos", dueDate: "2026-06-18", assignedTo: "usr-03", completed: true },
      { id: "tsk-003", title: "Pagar honorarios a receptor por notificaciones de testigos", dueDate: "2026-01-20", assignedTo: "usr-03", completed: true }
    ],
    notes: [
      { id: "nt-001", date: "2026-02-05 10:30", author: "Dr. Carlos Mendoza", text: "El gerente indica que no llegaremos a acuerdo extrajudicial pues el accidente ocurrió por negligencia del trabajador al quitarse el arnés." },
      { id: "nt-002", date: "2026-03-02 16:15", author: "Dra. Sofía Valenzuela", text: "El informe de la Inspección ratifica que los arneses estaban debidamente firmados en las hojas de control de EPP." }
    ],
    documents: []
  },
  {
    id: "LEG-2026-002",
    title: "Despido Indirecto y Horas Extras - Díaz vs. Logística Rápida",
    clientId: "cli-05",
    clientName: "Distribuidora Logística Rápida S.A.",
    opposingParty: "Roberto Díaz Prado (Ex Chofer)",
    opposingLawyer: "Defensoría Laboral (Oficina Metropolitana)",
    practiceArea: "Laboral",
    status: "Activo",
    court: "1° Juzgado de Letras del Trabajo de Santiago",
    judge: "Dr. Marcelo Gaete",
    assignedLawyerId: "usr-02",
    assignedLawyerName: "Dra. Sofía Valenzuela",
    startDate: "2026-03-10",
    description: "Defensa corporativa ante demanda de autodespido por acoso laboral y cobro de horas extraordinarias de despacho de carga pesada. Monto en disputa: $18.200.000 CLP.",
    timeline: [
      { date: "2026-03-10", title: "Notificación de Autodespido", desc: "Llega carta del trabajador alegando cese de funciones por incumplimiento contractual.", completed: true },
      { date: "2026-04-12", title: "Comparendo en Inspección", desc: "Se asiste a mediación administrativa; se frustra por falta de bases de acuerdo.", completed: true },
      { date: "2026-07-10", title: "Audiencia Preparatoria", desc: "Citación a tribunal para resolver excepciones y ratificar pruebas de jornada.", completed: false }
    ],
    tasks: [
      { id: "tsk-004", title: "Extraer planillas de marcas de GPS de los camiones", dueDate: "2026-06-24", assignedTo: "usr-02", completed: false },
      { id: "tsk-005", title: "Recopilar libro de firmas y registros biométricos", dueDate: "2026-03-12", assignedTo: "usr-03", completed: true }
    ],
    notes: [
      { id: "nt-003", date: "2026-03-11 09:00", author: "Dra. Sofía Valenzuela", text: "Las marcas de GPS demuestran que el chofer tomaba descansos extendidos en ruta. Eso desmiente las 40 horas extras semanales que reclama." }
    ],
    documents: []
  },
  {
    id: "LEG-2026-003",
    title: "Negociación Colectiva - Sindicato vs. Inversiones del Norte",
    clientId: "cli-02",
    clientName: "Inversiones del Norte S.A.S.",
    opposingParty: "Sindicato Interempresa N° 1 de Operadores",
    opposingLawyer: "Estudio Cariola & Cía (Asesores Sindicato)",
    practiceArea: "Laboral",
    status: "Cerrado",
    court: "Inspección Provincial del Trabajo de Iquique",
    judge: "N/A - Mediación del Trabajo",
    assignedLawyerId: "usr-01",
    assignedLawyerName: "Dr. Carlos Mendoza",
    startDate: "2026-02-01",
    description: "Asesoría corporativa integral en proceso de negociación colectiva reglada. Mediación de buenos oficios para evitar huelga legal y redacción de nuevo contrato colectivo de trabajo a 3 años.",
    timeline: [
      { date: "2026-02-01", title: "Presentación del Proyecto", desc: "El sindicato presenta el proyecto de contrato colectivo.", completed: true },
      { date: "2026-03-15", title: "Respuesta de la Empresa", desc: "Se formula la respuesta patronal ofreciendo reajustabilidad por IPC.", completed: true },
      { date: "2026-05-10", title: "Periodo de Buenos Oficios", desc: "Solicitud de mediación ante la Inspección para afinar bonos de término de conflicto.", completed: true },
      { date: "2026-06-05", title: "Firma de Contrato Colectivo", desc: "Firma en Inspección del Trabajo dando término formal al proceso.", completed: true }
    ],
    tasks: [
      { id: "tsk-006", title: "Registrar contrato colectivo ante la Inspección del Trabajo", dueDate: "2026-06-10", assignedTo: "usr-03", completed: true },
      { id: "tsk-007", title: "Enviar liquidación con bonos a contabilidad", dueDate: "2026-06-08", assignedTo: "usr-03", completed: true },
      { id: "tsk-008", title: "Elaborar última versión del acuerdo colectivo transado", dueDate: "2026-04-20", assignedTo: "usr-01", completed: true }
    ],
    notes: [
      { id: "nt-004", date: "2026-05-11 11:00", author: "Dr. Carlos Mendoza", text: "Logramos un acuerdo excelente. El sindicato aceptó congelar el bono de escolaridad a cambio del seguro de salud complementario." }
    ],
    documents: []
  },
  {
    id: "LEG-2026-004",
    title: "Tutela de Derechos y Despido - Gómez vs. Retail Express",
    clientId: "cli-04",
    clientName: "Servicios de Retail Express Ltda.",
    opposingParty: "María Elena Gómez (Ex Jefa de Tienda)",
    opposingLawyer: "Centro de Defensoría Laboral",
    practiceArea: "Laboral",
    status: "Activo",
    court: "1° Juzgado de Letras del Trabajo de Santiago",
    judge: "Dra. Eliana Rodríguez",
    assignedLawyerId: "usr-03",
    assignedLawyerName: "Lic. Mateo Ríos",
    startDate: "2026-04-05",
    description: "Demanda laboral por tutela de derechos fundamentales y despido injustificado. La ex-empleada acusa discriminación de género y solicita indemnizaciones y recargos por un total de $35.000.000 CLP.",
    timeline: [
      { date: "2026-04-05", title: "Mediación Inspección", desc: "Comparendo administrativo cerrado sin acuerdo por diferencias en montos.", completed: true },
      { date: "2026-04-22", title: "Notificación de Demanda Judicial", desc: "Se recibe notificación de tutela laboral y cobro de prestaciones.", completed: true },
      { date: "2026-05-30", title: "Audiencia Preparatoria", desc: "Ofrecimiento de testimonios y peritaje psicológico de la actora.", completed: true },
      { date: "2026-07-15", title: "Audiencia de Juicio", desc: "Fijada audiencia para rendir prueba documental y alegatos.", completed: false }
    ],
    tasks: [
      { id: "tsk-009", title: "Preparar testimonios de los supervisores de área", dueDate: "2026-07-05", assignedTo: "usr-03", completed: false },
      { id: "tsk-010", title: "Redactar y presentar escrito de contestación", dueDate: "2026-05-18", assignedTo: "usr-03", completed: true }
    ],
    notes: [
      { id: "nt-005", date: "2026-04-23 15:40", author: "Lic. Mateo Ríos", text: "La actora presenta conversaciones informales. Acreditaremos que las medidas de amonestación respondieron estrictamente a faltas de caja auditadas." }
    ],
    documents: []
  },
  {
    id: "LEG-2026-005",
    title: "Reclamación de Multas de Inspección - Inversiones del Norte S.A.S.",
    clientId: "cli-02",
    clientName: "Inversiones del Norte S.A.S.",
    opposingParty: "Inspección Provincial del Trabajo de Santiago",
    opposingLawyer: "Cuerpo Jurídico de la Dirección del Trabajo",
    practiceArea: "Laboral",
    status: "En Apelación",
    court: "Tribunal de Letras del Trabajo de Iquique",
    judge: "Don Hernán Silva",
    assignedLawyerId: "usr-01",
    assignedLawyerName: "Dr. Carlos Mendoza",
    startDate: "2025-08-10",
    description: "Reclamación judicial de multas administrativas aplicadas por la Inspección del Trabajo por supuestas infracciones a las jornadas laborales de descanso de choferes de despacho.",
    timeline: [
      { date: "2025-08-10", title: "Ingreso de Reclamación de Multa", desc: "Presentación de reclamo de multa administrativa ante el juzgado.", completed: true },
      { date: "2025-11-20", title: "Sentencia de Primera Instancia", desc: "El tribunal acoge parcialmente rebajando la multa en un 70%.", completed: true },
      { date: "2025-12-15", title: "Recurso de Apelación", desc: "Interposición de apelación ante la Corte solicitando nulidad total.", completed: true },
      { date: "2026-07-02", title: "Alegatos en Corte de Apelaciones", desc: "Causa en tabla para alegatos de nulidad administrativa.", completed: false }
    ],
    tasks: [
      { id: "tsk-011", title: "Preparar minuta y minutas de fallos TTA análogos", dueDate: "2026-06-28", assignedTo: "usr-01", completed: false },
      { id: "tsk-012", title: "Monitorear tabla de alegatos en la Corte", dueDate: "2026-06-20", assignedTo: "usr-03", completed: true }
    ],
    notes: [
      { id: "nt-006", date: "2025-11-22 17:00", author: "Dr. Carlos Mendoza", text: "La sentencia incurre en error de cómputo del artículo 22. Apelaremos con buenas expectativas." }
    ],
    documents: []
  },
  {
    id: "LEG-2026-006",
    title: "Desafuero Sindical Dirigente - BioTecno vs. Valencia",
    clientId: "cli-03",
    clientName: "BioTecno Labs S.A.",
    opposingParty: "Hugo Valencia Cid (Dirigente Sindicato)",
    opposingLawyer: "Asesoría Jurídica Sindicato BioTecno",
    practiceArea: "Laboral",
    status: "Activo",
    court: "2° Juzgado de Letras del Trabajo de Santiago",
    judge: "Junta de Vocales INAPI",
    assignedLawyerId: "usr-02",
    assignedLawyerName: "Dra. Sofía Valenzuela",
    startDate: "2025-10-05",
    description: "Juicio de desafuero sindical por faltas injustificadas y abandono de labores de dirigente sindical. Se solicita autorización judicial para desvincular sin pago de indemnización por fuero.",
    timeline: [
      { date: "2025-10-05", title: "Ingreso de la Causa", desc: "Se presenta la demanda de desafuero judicial.", completed: true },
      { date: "2026-01-20", title: "Fijación de Hechos a Probar", desc: "El tribunal determina puntos de prueba sobre las inasistencias.", completed: true },
      { date: "2026-02-18", title: "Contestación del Demandado", desc: "El dirigente alega que las ausencias correspondían a horas de fuero sindical.", completed: true },
      { date: "2026-07-30", title: "Audiencia de Juicio", desc: "Rendición de bitácoras de asistencia y firmas de registro.", completed: false }
    ],
    tasks: [
      { id: "tsk-013", title: "Obtener bitácoras firmadas e informes de Recursos Humanos", dueDate: "2026-06-25", assignedTo: "usr-02", completed: false },
      { id: "tsk-014", title: "Certificar inasistencias con Notario Público", dueDate: "2026-02-05", assignedTo: "usr-03", completed: true }
    ],
    notes: [
      { id: "nt-007", date: "2026-01-22 12:00", author: "Dra. Sofía Valenzuela", text: "El dirigente no avisó con las 48 horas reglamentarias para hacer uso de sus horas de fuero. Contamos con los correos de RRHH de respaldo." }
    ],
    documents: []
  },
  {
    id: "LEG-2026-007",
    title: "Cobro de Cotizaciones y Ley Bustos - Larraín vs. El Campo S.A.",
    clientId: "cli-06",
    clientName: "Agrícola Ganadera El Campo S.A.",
    opposingParty: "Andrés Larraín Soto (Ex Capataz)",
    opposingLawyer: "Defensa Laboral de Buin",
    practiceArea: "Laboral",
    status: "Cerrado",
    court: "Juzgado de Letras de Buin",
    judge: "Don Sergio Villalobos",
    assignedLawyerId: "usr-03",
    assignedLawyerName: "Lic. Mateo Ríos",
    startDate: "2026-03-01",
    description: "Demanda por despido injustificado y cobro de cotizaciones provisionales adeudadas (nulidad del despido - Ley Bustos). Defensa corporativa de la empresa acreditando pago total mediante cartolas previsionales.",
    timeline: [
      { date: "2026-03-01", title: "Notificación de Nulidad", desc: "El ex capataz demanda pidiendo nulidad del despido por cotizaciones impagas.", completed: true },
      { date: "2026-04-10", title: "Audiencia Única de Juicio", desc: "Se exhiben planillas Previred e informes de AFP con timbres de pago oportuno.", completed: true },
      { date: "2026-04-25", title: "Sentencia Absolutoria", desc: "El tribunal rechaza la nulidad del despido y absuelve a Agrícola El Campo S.A.", completed: true },
      { date: "2026-05-15", title: "Archivo de la Causa", desc: "Se archiva el expediente judicial tras no presentarse recursos de nulidad.", completed: true }
    ],
    tasks: [
      { id: "tsk-015", title: "Retirar certificado de ejecutoria de la sentencia", dueDate: "2026-05-20", assignedTo: "usr-03", completed: true },
      { id: "tsk-016", title: "Solicitar cartolas históricas a AFP Capital e IPS", dueDate: "2026-03-05", assignedTo: "usr-03", completed: true }
    ],
    notes: [
      { id: "nt-008", date: "2026-04-10 13:00", author: "Lic. Mateo Ríos", text: "La contraparte se desistió del cobro al ver el certificado oficial de Previred que ingresamos. Victoria limpia para el cliente." }
    ],
    documents: []
  },
  {
    id: "LEG-2026-008",
    title: "Prácticas Antisindicales - Sindicato N° 2 vs. Alfa",
    clientId: "cli-01",
    clientName: "Constructora Alfa S.A.",
    opposingParty: "Sindicato Nacional de Trabajadores de la Construcción",
    opposingLawyer: "Estudio Barros & Errázuriz",
    practiceArea: "Laboral",
    status: "Suspendido",
    court: "2° Juzgado de Letras del Trabajo de Santiago",
    judge: "Ministro Presidente Javier Tapia",
    assignedLawyerId: "usr-01",
    assignedLawyerName: "Dr. Carlos Mendoza",
    startDate: "2025-11-12",
    description: "Defensa corporativa ante denuncia de Inspección del Trabajo por supuesta práctica antisindical. El sindicato acusa discriminación por extensión de beneficios de contrato colectivo a trabajadores no sindicalizados.",
    timeline: [
      { date: "2025-11-12", title: "Notificación de Denuncia", desc: "Ingresa la denuncia de la Inspección con citación a tribunal.", completed: true },
      { date: "2025-12-05", title: "Audiencia de Contestación", desc: "Se contesta negando dolo antisindical y justificando beneficios por desempeño general.", completed: true },
      { date: "2026-03-10", title: "Apertura de Mesa de Acuerdo", desc: "Suspensión del juicio para negociar protocolo de extensión de beneficios consensual.", completed: true }
    ],
    tasks: [
      { id: "tsk-017", title: "Redactar borrador de acuerdo de extensión de beneficios", dueDate: "2026-06-25", assignedTo: "usr-01", completed: false },
      { id: "tsk-018", title: "Preparar liquidaciones históricas comparadas", dueDate: "2025-11-20", assignedTo: "usr-02", completed: true }
    ],
    notes: [
      { id: "nt-009", date: "2026-03-12 10:00", author: "Dr. Carlos Mendoza", text: "Si el sindicato acepta el protocolo propuesto en la mesa de negociación, la Inspección desistirá de la multa. Estamos afinando redacción." }
    ],
    documents: []
  }
];

export const DEFAULT_AUDIT_LOGS: AuditLog[] = [
  { timestamp: "2026-06-21 14:32:15", userId: "usr-04", userName: "Ing. Alejandro Torres", userRole: "TI Administrador", action: "Inicio de sesión exitoso en consola de administración", status: "Success" },
  { timestamp: "2026-06-21 13:10:44", userId: "usr-01", userName: "Dr. Carlos Mendoza", userRole: "Socio Principal", action: "Descarga de informe financiero de facturación Q2", status: "Success" },
  { timestamp: "2026-06-21 11:25:02", userId: "usr-03", userName: "Lic. Mateo Ríos", userRole: "Abogado Junior", action: "Creación de tarea 'Preparar perito' en expediente LEG-2026-001", status: "Success" },
  { timestamp: "2026-06-21 10:05:12", userId: "usr-04", userName: "Ing. Alejandro Torres", userRole: "TI Administrador", action: "Cambio de estado del usuario Dra. Valentina Paz a 'Inactivo'", status: "Warning" },
  { timestamp: "2026-06-21 09:12:45", userId: "usr-03", userName: "Lic. Mateo Ríos", userRole: "Abogado Junior", action: "Intento de acceso a configuración de seguridad de TI", status: "Denied" },
  { timestamp: "2026-06-20 17:40:00", userId: "usr-02", userName: "Dra. Sofía Valenzuela", userRole: "Abogado Senior", action: "Modificación de descripción de causa penal LEG-2026-002", status: "Success" },
  { timestamp: "2026-06-20 15:30:12", userId: "usr-04", userName: "Ing. Alejandro Torres", userRole: "TI Administrador", action: "Copia de seguridad del sistema ejecutada con éxito (Backup Auto-2106)", status: "Success" }
];

export const DEFAULT_FINANCIALS: Financials = {
  summary: {
    totalRevenue: 24500000,
    pendingPayments: 12800000,
    totalExpenses: 4200000,
    hoursBilledThisMonth: 184
  },
  monthlyRevenue: [
    { month: "Enero", billed: 4200000, collected: 3800000 },
    { month: "Febrero", billed: 5800000, collected: 4500000 },
    { month: "Marzo", billed: 6100000, collected: 5200000 },
    { month: "Abril", billed: 7300000, collected: 6000000 },
    { month: "Mayo", billed: 8900000, collected: 7100000 },
    { month: "Junio", billed: 5200000, collected: 4200000 }
  ]
};

// Database Initialization Helper
export const LegiumDB = {
  get: function<T>(key: string, defaultValue: T): T {
    const data = localStorage.getItem(`legium_${key}`);
    if (data) {
      try {
        return JSON.parse(data) as T;
      } catch (e) {
        console.error("Error parsing localStorage key " + key, e);
        return defaultValue;
      }
    }
    this.set(key, defaultValue);
    return defaultValue;
  },

  set: function<T>(key: string, value: T): void {
    localStorage.setItem(`legium_${key}`, JSON.stringify(value));
  },

  initialize: function(): void {
    // If any cases have non-Laboral practice areas, force override with new labor seed cases
    const currentCases = this.get<Case[]>("cases", DEFAULT_CASES);
    const hasNonLaboral = currentCases.some(c => c.practiceArea !== 'Laboral');
    if (hasNonLaboral) {
      localStorage.removeItem("legium_cases");
      localStorage.removeItem("legium_clients");
      localStorage.removeItem("legium_users");
      localStorage.removeItem("legium_logs");
      localStorage.removeItem("legium_financials");
    }

    const users = this.get<User[]>("users", DEFAULT_USERS);
    // Sync default users if any are missing from pre-existing localStorage
    let usersUpdated = false;
    DEFAULT_USERS.forEach((defaultUser) => {
      if (!users.some((u) => u.id === defaultUser.id)) {
        users.push(defaultUser);
        usersUpdated = true;
      }
    });
    if (usersUpdated) {
      this.set("users", users);
    }
    
    this.get<Client[]>("clients", DEFAULT_CLIENTS);
    
    // Load cases and ensure each has a documents array and demo files populated
    const cases = this.get<Case[]>("cases", DEFAULT_CASES);
    let updated = false;
    cases.forEach(c => {
      if (c.documents) {
        c.documents = c.documents.filter(d => !d.id.startsWith("doc-mock-"));
      } else {
        c.documents = [];
        updated = true;
      }
      
      // Ensure mock PDFs are linked for initial demo view
      if (c.documents.length === 0) {
        const idNum = c.id.split('-')[2]; // e.g. 001, 002...
        let docName = "";
        let docSize = "";
        if (c.id === "LEG-2026-001") { docName = "Demanda_Civil_Reivindicacion.pdf"; docSize = "1.5 KB"; }
        else if (c.id === "LEG-2026-002") { docName = "Recurso_Apelacion_Penal.pdf"; docSize = "1.6 KB"; }
        else if (c.id === "LEG-2026-003") { docName = "Contrato_Fusion_Corporativo.pdf"; docSize = "1.6 KB"; }
        else if (c.id === "LEG-2026-004") { docName = "Demanda_Laboral_Despido.pdf"; docSize = "1.7 KB"; }
        else if (c.id === "LEG-2026-005") { docName = "Reclamacion_Tributaria_SII.pdf"; docSize = "1.7 KB"; }
        else if (c.id === "LEG-2026-006") { docName = "Contestacion_INAPI_Patente.pdf"; docSize = "1.6 KB"; }
        else if (c.id === "LEG-2026-007") { docName = "Demanda_Familia_Divorcio.pdf"; docSize = "1.6 KB"; }
        else if (c.id === "LEG-2026-008") { docName = "Demanda_Competencia_Desleal.pdf"; docSize = "1.8 KB"; }

        if (docName) {
          c.documents.push({
            id: `doc-mock-${idNum}`,
            name: docName,
            size: docSize,
            uploadDate: c.startDate
          });
          updated = true;
        }
      }
    });
    if (updated) {
      this.set("cases", cases);
    }

    this.get<AuditLog[]>("logs", DEFAULT_AUDIT_LOGS);
    this.get<Financials>("financials", DEFAULT_FINANCIALS);
  },

  reset: function(): void {
    localStorage.removeItem("legium_users");
    localStorage.removeItem("legium_clients");
    localStorage.removeItem("legium_cases");
    localStorage.removeItem("legium_logs");
    localStorage.removeItem("legium_financials");
    localStorage.removeItem("legium_current_user");
    localStorage.removeItem("legium_notifications");
    this.initialize();
  },

  getCurrentUser: function(): User | null {
    const data = localStorage.getItem("legium_current_user");
    return data ? JSON.parse(data) as User : null;
  },

  setCurrentUser: function(user: User | null): void {
    if (user) {
      localStorage.setItem("legium_current_user", JSON.stringify(user));
      this.addLog(user.id, `Simulación de cambio de usuario a ${user.name} (${user.role})`, "Success");
    } else {
      localStorage.removeItem("legium_current_user");
    }
  },

  addLog: function(userId: string, action: string, status: 'Success' | 'Warning' | 'Denied' = "Success"): void {
    const logs = this.get<AuditLog[]>("logs", DEFAULT_AUDIT_LOGS);
    const users = this.get<User[]>("users", DEFAULT_USERS);
    const user = users.find(u => u.id === userId) || { name: "Sistema", role: "Automatización" as any };
    
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    
    logs.unshift({
      timestamp,
      userId,
      userName: user.name,
      userRole: user.role,
      action,
      status
    });
    
    if (logs.length > 50) logs.pop();
    
    this.set("logs", logs);
  },

  getNotifications: function(): Notification[] {
    const data = localStorage.getItem("legium_notifications");
    if (data) {
      try {
        return JSON.parse(data) as Notification[];
      } catch (e) {
        console.error("Error parsing notifications", e);
        return [];
      }
    }
    return [];
  },

  addNotification: function(title: string, message: string, caseId?: string, targetRole?: string): void {
    const notifications = this.getNotifications();
    const newNoti: Notification = {
      id: 'noti-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
      title,
      message,
      date: new Date().toISOString(),
      read: false,
      caseId,
      ...(targetRole ? { targetRole: targetRole as any } : {})
    };
    notifications.unshift(newNoti);
    if (notifications.length > 20) {
      notifications.pop();
    }
    localStorage.setItem("legium_notifications", JSON.stringify(notifications));
  },

  markNotificationAsRead: function(id: string): void {
    const notifications = this.getNotifications();
    const updated = notifications.map(n => n.id === id ? { ...n, read: true } : n);
    localStorage.setItem("legium_notifications", JSON.stringify(updated));
  },

  markAllNotificationsAsRead: function(): void {
    const notifications = this.getNotifications();
    const updated = notifications.map(n => ({ ...n, read: true }));
    localStorage.setItem("legium_notifications", JSON.stringify(updated));
  }
};
