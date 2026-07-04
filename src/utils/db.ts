import { User, Client, Case, AuditLog, Financials } from './types';

export const DEFAULT_USERS: User[] = [
  { id: "usr-01", name: "Dr. Carlos Mendoza", email: "carlos.mendoza@legium.law", role: "Socio Principal", active: true, avatar: "CM" },
  { id: "usr-02", name: "Dra. Sofía Valenzuela", email: "sofia.valenzuela@legium.law", role: "Abogado Senior", active: true, avatar: "SV" },
  { id: "usr-03", name: "Lic. Mateo Ríos", email: "mateo.rios@legium.law", role: "Abogado Junior", active: true, avatar: "MR" },
  { id: "usr-04", name: "Ing. Alejandro Torres", email: "alejandro.torres@legium.law", role: "TI Administrador", active: true, avatar: "AT" },
  { id: "usr-05", name: "Dra. Valentina Paz", email: "valentina.paz@legium.law", role: "Abogado Senior", active: false, avatar: "VP" }
];

export const DEFAULT_CLIENTS: Client[] = [
  { id: "cli-01", name: "Constructora Alfa S.A.", email: "legal@constructoraalfa.com", phone: "+56 9 8765 4321", type: "Corporativo", rfc: "CALF900812-A10", contactPerson: "Ing. Luis Fuentes" },
  { id: "cli-02", name: "Inversiones del Norte S.A.S.", email: "contacto@inversionesnorte.cl", phone: "+56 9 1234 5678", type: "Corporativo", rfc: "INOR150320-TX9", contactPerson: "Sra. Clara Belmar" },
  { id: "cli-03", name: "BioTecno Labs S.A.", email: "patentes@biotecnolabs.com", phone: "+56 2 2456 7890", type: "Corporativo", rfc: "BLAB201105-3R8", contactPerson: "Dr. Hugo Valencia" },
  { id: "cli-04", name: "María Elena Gómez", email: "maria.gomez@gmail.com", phone: "+56 9 9988 7766", type: "Individual", rfc: "GOME750614-XYZ", contactPerson: "María Elena Gómez" },
  { id: "cli-05", name: "Roberto Díaz", email: "roberto.diaz.p@outlook.com", phone: "+56 9 5544 3322", type: "Individual", rfc: "DIAR820921-H22", contactPerson: "Roberto Díaz" },
  { id: "cli-06", name: "Andrés Larraín", email: "andres.larrain@yahoo.com", phone: "+56 9 4433 2211", type: "Individual", rfc: "LARA880402-K99", contactPerson: "Andrés Larraín" }
];

export const DEFAULT_CASES: Case[] = [
  {
    id: "LEG-2026-001",
    title: "Demanda de Reivindicación Alfa vs. Beta",
    clientId: "cli-01",
    clientName: "Constructora Alfa S.A.",
    opposingParty: "Corporación Beta S.A.",
    opposingLawyer: "Estudio Jurídico Silva & Asociados",
    practiceArea: "Civil",
    status: "Activo",
    court: "2° Juzgado Civil de Santiago",
    judge: "Dra. Patricia Ortiz",
    assignedLawyerId: "usr-01",
    assignedLawyerName: "Dr. Carlos Mendoza",
    startDate: "2026-01-15",
    description: "Juicio reivindicatorio sobre terreno en Colina. Disputa de límites de deslindes tras nueva topografía municipal. Constructora Alfa exige restitución del paño norte de 1,200 metros cuadrados.",
    timeline: [
      { date: "2026-01-15", title: "Presentación de Demanda", desc: "Se ingresa el escrito de demanda en la corte de origen.", completed: true },
      { date: "2026-02-04", title: "Notificación al Demandado", desc: "El receptor judicial efectúa la notificación a Corporación Beta S.A.", completed: true },
      { date: "2026-03-01", title: "Contestación de Demanda", desc: "La demandada presenta sus excepciones y contesta negando los hechos.", completed: true },
      { date: "2026-06-25", title: "Audiencia de Conciliación", desc: "Citación a comparendo de conciliación obligatorio fijado por el tribunal.", completed: false },
      { date: "2026-07-20", title: "Término Probatorio", desc: "Apertura del periodo para presentar pruebas y testigos.", completed: false }
    ],
    tasks: [
      { id: "tsk-001", title: "Preparar minuta de conciliación", dueDate: "2026-06-23", assignedTo: "usr-02", completed: false },
      { id: "tsk-002", title: "Coordinar perito topógrafo judicial", dueDate: "2026-06-18", assignedTo: "usr-03", completed: true },
      { id: "tsk-003", title: "Pagar tasas de receptoría judicial", dueDate: "2026-01-20", assignedTo: "usr-03", completed: true }
    ],
    notes: [
      { id: "nt-001", date: "2026-02-05 10:30", author: "Dr. Carlos Mendoza", text: "El cliente insiste en que no aceptará un acuerdo inferior al 80% del terreno en disputa." },
      { id: "nt-002", date: "2026-03-02 16:15", author: "Dra. Sofía Valenzuela", text: "La contestación de la contraparte es débil en cuanto a la inscripción de dominio de 1994. Tenemos ventaja documental." }
    ],
    documents: []
  },
  {
    id: "LEG-2026-002",
    title: "Defensa Penal - Supuesto Delito Tributario",
    clientId: "cli-05",
    clientName: "Roberto Díaz",
    opposingParty: "Servicio de Impuestos Internos / Ministerio Público",
    opposingLawyer: "Fiscalía Centro Norte - Fiscal de Delitos Económicos",
    practiceArea: "Penal",
    status: "Activo",
    court: "8° Juzgado de Garantía de Santiago",
    judge: "Dr. Marcelo Gaete",
    assignedLawyerId: "usr-02",
    assignedLawyerName: "Dra. Sofía Valenzuela",
    startDate: "2026-03-10",
    description: "Defensa de Roberto Díaz en investigación formalizada por supuesta emisión de facturas ideológicamente falsas e infracciones del código tributario. Monto imputado: $120.000.000 CLP.",
    timeline: [
      { date: "2026-03-10", title: "Formalización de la Investigación", desc: "El tribunal fija plazo de investigación de 120 días y decreta firma mensual.", completed: true },
      { date: "2026-04-12", title: "Entrega de Peritaje Contable Privado", desc: "Ingreso de informe forense contable propio para desmentir dolo.", completed: true },
      { date: "2026-07-10", title: "Audiencia de Cierre de Investigación", desc: "Vencimiento del plazo judicial. Se discutirá sobreseimiento o preparación de juicio.", completed: false }
    ],
    tasks: [
      { id: "tsk-004", title: "Reunión con el perito contable para afinar anexos", dueDate: "2026-06-24", assignedTo: "usr-02", completed: false },
      { id: "tsk-005", title: "Solicitar copias autorizadas de carpeta fiscal", dueDate: "2026-03-12", assignedTo: "usr-03", completed: true }
    ],
    notes: [
      { id: "nt-003", date: "2026-03-11 09:00", author: "Dra. Sofía Valenzuela", text: "El fiscal se mostró abierto a una salida alternativa si se repara el 50% del perjuicio estimado. El cliente está evaluando créditos." }
    ],
    documents: []
  },
  {
    id: "LEG-2026-003",
    title: "Reestructuración y Fusión Corporativa",
    clientId: "cli-02",
    clientName: "Inversiones del Norte S.A.S.",
    opposingParty: "N/A - Mutuo Acuerdo con Grupo Sur S.A.",
    opposingLawyer: "Estudio Cariola & Cía",
    practiceArea: "Corporativo",
    status: "Cerrado",
    court: "Notaría Pública N° 45 de Santiago",
    judge: "N/A - Trámite Notarial",
    assignedLawyerId: "usr-01",
    assignedLawyerName: "Dr. Carlos Mendoza",
    startDate: "2026-02-01",
    description: "Proceso de absorción y fusión de Grupo Sur S.A. por parte de Inversiones del Norte S.A.S. Incluye Due Diligence contable y legal de activos, transferencia de patentes y marcas, y redacción de nuevos estatutos corporativos.",
    timeline: [
      { date: "2026-02-01", title: "Inicio de Due Diligence", desc: "Revisión documental de pasivos, contratos de trabajo y licencias del absorbido.", completed: true },
      { date: "2026-03-15", title: "Firma de Promesa de Fusión", desc: "Firma preliminar del protocolo de fusión y acuerdo de confidencialidad.", completed: true },
      { date: "2026-05-10", title: "Aprobación de Juntas de Accionistas", desc: "Sesión extraordinaria de juntas de ambas sociedades aprobando la operación.", completed: true },
      { date: "2026-06-05", title: "Firma de Escritura Pública e Inscripción", desc: "Redacción final y firma en notaría. Inscripción en Conservador de Comercio y publicación en Diario Oficial.", completed: true }
    ],
    tasks: [
      { id: "tsk-006", title: "Publicar extracto de fusión en Diario Oficial", dueDate: "2026-06-10", assignedTo: "usr-03", completed: true },
      { id: "tsk-007", title: "Inscripción en Registro de Comercio de Santiago", dueDate: "2026-06-08", assignedTo: "usr-03", completed: true },
      { id: "tsk-008", title: "Elaborar borrador final de contrato de fusión", dueDate: "2026-04-20", assignedTo: "usr-01", completed: true }
    ],
    notes: [
      { id: "nt-004", date: "2026-05-11 11:00", author: "Dr. Carlos Mendoza", text: "Fusión aprobada unánimemente. Los socios quedaron muy conformes con el control de pasivos laborales que recomendamos." }
    ],
    documents: []
  },
  {
    id: "LEG-2026-004",
    title: "Demanda Laboral por Despido Injustificado",
    clientId: "cli-04",
    clientName: "María Elena Gómez",
    opposingParty: "Retail Multitiendas Falabella S.A.",
    opposingLawyer: "Abogados Internos Falabella",
    practiceArea: "Laboral",
    status: "Activo",
    court: "1° Juzgado de Letras del Trabajo de Santiago",
    judge: "Dra. Eliana Rodríguez",
    assignedLawyerId: "usr-03",
    assignedLawyerName: "Lic. Mateo Ríos",
    startDate: "2026-04-05",
    description: "Demanda laboral por tutela de derechos fundamentales y despido injustificado tras 8 años de servicio como Gerente de Tienda. Se solicita indemnización por años de servicio, recargo legal y daño moral. Total reclamado: $45.000.000 CLP.",
    timeline: [
      { date: "2026-04-05", title: "Mediación frustrada en Inspección del Trabajo", desc: "Cierre de etapa administrativa. Se levanta acta sin acuerdo por incomparecencia del empleador.", completed: true },
      { date: "2026-04-22", title: "Ingreso de la Demanda Laboral", desc: "Se presenta el escrito vía portal judicial electrónico.", completed: true },
      { date: "2026-05-30", title: "Audiencia Preparatoria", desc: "Se ofrecen los medios de prueba (documental, confesional y testimonial) y se fija fecha de juicio.", completed: true },
      { date: "2026-07-15", title: "Audiencia de Juicio del Trabajo", desc: "Rendición de pruebas presencial ante la jueza y fallo de primera instancia.", completed: false }
    ],
    tasks: [
      { id: "tsk-009", title: "Citación a testigos de la demandante para preparar declaraciones", dueDate: "2026-07-05", assignedTo: "usr-03", completed: false },
      { id: "tsk-010", title: "Redactar y adjuntar objeciones a la contestación de Falabella", dueDate: "2026-05-18", assignedTo: "usr-03", completed: true }
    ],
    notes: [
      { id: "nt-005", date: "2026-04-23 15:40", author: "Lic. Mateo Ríos", text: "María Elena aportó pantallazos de WhatsApp claves que demuestran el acoso laboral (mobbing). Eso sustenta fuertemente la tutela de derechos." }
    ],
    documents: []
  },
  {
    id: "LEG-2026-005",
    title: "Reclamación Tributaria contra Liquidación del SII",
    clientId: "cli-02",
    clientName: "Inversiones del Norte S.A.S.",
    opposingParty: "Servicio de Impuestos Internos (SII)",
    opposingLawyer: "Cuerpo de Abogados de la Dirección Regional Metropolitana SII",
    practiceArea: "Tributario",
    status: "En Apelación",
    court: "Tribunal Tributario y Aduanero (TTA) Metropolitano",
    judge: "Don Hernán Silva",
    assignedLawyerId: "usr-01",
    assignedLawyerName: "Dr. Carlos Mendoza",
    startDate: "2025-08-10",
    description: "Reclamación judicial en contra de la liquidación de impuestos N° 204-205 que rechaza gastos de asesoría externa de ejercicios comerciales 2023-2024. SII reclama el pago de diferencias impositivas por un total de $78.500.000 CLP.",
    timeline: [
      { date: "2025-08-10", title: "Presentación del Reclamo", desc: "Presentación del escrito ante el TTA dentro del plazo de 90 días.", completed: true },
      { date: "2025-11-20", title: "Sentencia de Primera Instancia", desc: "El TTA rechaza parcialmente el reclamo, manteniendo la liquidación en un 60%.", completed: true },
      { date: "2025-12-15", title: "Recurso de Apelación", desc: "Legium presenta recurso ante la Corte de Apelaciones de Santiago.", completed: true },
      { date: "2026-07-02", title: "Alegatos en Corte de Apelaciones", desc: "Vista de la causa en la Primera Sala. El socio principal defenderá los alegatos oralmente.", completed: false }
    ],
    tasks: [
      { id: "tsk-011", title: "Preparar minuta de alegatos para la apelación", dueDate: "2026-06-28", assignedTo: "usr-01", completed: false },
      { id: "tsk-012", title: "Monitorear estado de la tabla judicial diariamente", dueDate: "2026-06-20", assignedTo: "usr-03", completed: true }
    ],
    notes: [
      { id: "nt-006", date: "2025-11-22 17:00", author: "Dr. Carlos Mendoza", text: "La sentencia del TTA tiene una contradicción grave sobre la justificación del gasto en la pág 14. Ese será nuestro foco principal en la Corte de Apelaciones." }
    ],
    documents: []
  },
  {
    id: "LEG-2026-006",
    title: "Propiedad Intelectual - Registro Patente Biotecnológica",
    clientId: "cli-03",
    clientName: "BioTecno Labs S.A.",
    opposingParty: "Instituto Nacional de Propiedad Industrial (INAPI)",
    opposingLawyer: "Defensores de Marcas / Dirección Jurídica INAPI",
    practiceArea: "Corporativo",
    status: "Activo",
    court: "Tribunal de Propiedad Industrial",
    judge: "Junta de Vocales INAPI",
    assignedLawyerId: "usr-02",
    assignedLawyerName: "Dra. Sofía Valenzuela",
    startDate: "2025-10-05",
    description: "Proceso de apelación y contestación de observaciones sustantivas por el registro de la patente del compuesto de síntesis enzimática 'Biolase-X9'. INAPI formuló reparos por supuesta falta de novedad inventiva frente a un registro europeo anterior.",
    timeline: [
      { date: "2025-10-05", title: "Ingreso de Solicitud de Patente", desc: "Registro técnico y pago de derechos.", completed: true },
      { date: "2026-01-20", title: "Informe de Perito INAPI", desc: "El perito formula observaciones alegando cercanía con patentes europeas.", completed: true },
      { date: "2026-02-18", title: "Contestación de Observaciones", desc: "Se ingresa escrito técnico desglosando la diferencia estructural del compuesto.", completed: true },
      { date: "2026-07-30", title: "Resolución Final de Concesión", desc: "Fecha esperada para dictamen de aceptación o rechazo definitivo.", completed: false }
    ],
    tasks: [
      { id: "tsk-013", title: "Revisar traducciones de la patente de comparación de la UE", dueDate: "2026-06-25", assignedTo: "usr-02", completed: false },
      { id: "tsk-014", title: "Pagar honorarios adicionales al perito de la firma", dueDate: "2026-02-05", assignedTo: "usr-03", completed: true }
    ],
    notes: [
      { id: "nt-007", date: "2026-01-22 12:00", author: "Dra. Sofía Valenzuela", text: "El perito de INAPI no entendió el proceso de catalización a temperatura ambiente. Preparamos un anexo gráfico con el equipo de I+D de BioTecno Labs." }
    ],
    documents: []
  },
  {
    id: "LEG-2026-007",
    title: "Divorcio por Mutuo Acuerdo - Larraín / Silva",
    clientId: "cli-06",
    clientName: "Andrés Larraín",
    opposingParty: "Camila Silva",
    opposingLawyer: "Dra. Mónica Rosas",
    practiceArea: "Civil",
    status: "Cerrado",
    court: "2° Juzgado de Familia de Santiago",
    judge: "Don Sergio Villalobos",
    assignedLawyerId: "usr-03",
    assignedLawyerName: "Lic. Mateo Ríos",
    startDate: "2026-03-01",
    description: "Causa de divorcio de mutuo acuerdo con cese de convivencia superior a un año. Incluye redacción de acuerdo de relaciones mutuas, régimen de alimentos, cuidado personal de hijos y régimen comunicacional, además de compensación económica pactada.",
    timeline: [
      { date: "2026-03-01", title: "Presentación de la Solicitud Conjunta", desc: "Ingreso de la solicitud y del instrumento de Acuerdo de Relaciones Mutuas.", completed: true },
      { date: "2026-04-10", title: "Audiencia de Juicio y Conciliación", desc: "Se ratifica el cese de convivencia con prueba testimonial y se rinde el acuerdo ante el juez.", completed: true },
      { date: "2026-04-25", title: "Dictación de Sentencia de Divorcio", desc: "El juez dicta sentencia acogiendo el divorcio y decretando la subinscripción en el Registro Civil.", completed: true },
      { date: "2026-05-15", title: "Subinscripción de Divorcio", desc: "El Conservador del Registro Civil inscribe la nulidad matrimonial al margen de la partida de matrimonio.", completed: true }
    ],
    tasks: [
      { id: "tsk-015", title: "Obtener certificado de matrimonio subinscrito y entregar al cliente", dueDate: "2026-05-20", assignedTo: "usr-03", completed: true },
      { id: "tsk-016", title: "Recopilar firmas de testigos para declaración jurada", dueDate: "2026-03-05", assignedTo: "usr-03", completed: true }
    ],
    notes: [
      { id: "nt-008", date: "2026-04-10 13:00", author: "Lic. Mateo Ríos", text: "El acuerdo fue homologado sin reparos por el juez de familia. Caso cerrado eficientemente." }
    ],
    documents: []
  },
  {
    id: "LEG-2026-008",
    title: "Demanda de Competencia Desleal Alfa vs. Constructora Beta",
    clientId: "cli-01",
    clientName: "Constructora Alfa S.A.",
    opposingParty: "Constructora Beta S.A. y ex-socios",
    opposingLawyer: "Estudio Barros & Errázuriz",
    practiceArea: "Corporativo",
    status: "Suspendido",
    court: "Tribunal de Defensa de la Libre Competencia",
    judge: "Ministro Presidente Javier Tapia",
    assignedLawyerId: "usr-01",
    assignedLawyerName: "Dr. Carlos Mendoza",
    startDate: "2025-11-12",
    description: "Demanda civil de indemnización de perjuicios por actos de competencia desleal, consistentes en el desvío sistemático de clientes y aprovechamiento de información confidencial de licitaciones por parte de ex-gerentes clave que migraron a Beta S.A. Daño estimado: $250.000.000 CLP.",
    timeline: [
      { date: "2025-11-12", title: "Presentación de la Demanda de Competencia Desleal", desc: "Demanda interpuesta en el TDLC con solicitud de medidas prejudiciales.", completed: true },
      { date: "2025-12-05", title: "Aceptación de Medida Prejudicial precautoria", desc: "El tribunal ordena la exhibición de correos del servidor de la demandada.", completed: true },
      { date: "2026-03-10", title: "Suspensión de Común Acuerdo por Negociación", desc: "Se presenta escrito solicitando la suspensión del procedimiento por 90 días para explorar acuerdo extrajudicial.", completed: true }
    ],
    tasks: [
      { id: "tsk-017", title: "Redactar borrador de acuerdo transaccional confidencial", dueDate: "2026-06-25", assignedTo: "usr-01", completed: false },
      { id: "tsk-018", title: "Analizar reporte de auditoría sobre fuga de información", dueDate: "2025-11-20", assignedTo: "usr-02", completed: true }
    ],
    notes: [
      { id: "nt-009", date: "2026-03-12 10:00", author: "Dr. Carlos Mendoza", text: "El plazo de suspensión vence en junio. Nos reuniremos el 23 con los directores de Alfa para ver si aceptamos su oferta de indemnización." }
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
    this.get<User[]>("users", DEFAULT_USERS);
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
    
    if (!localStorage.getItem("legium_current_user")) {
      localStorage.setItem("legium_current_user", JSON.stringify(DEFAULT_USERS[3])); // Ing. Alejandro Torres (TI Admin)
    }
  },

  reset: function(): void {
    localStorage.removeItem("legium_users");
    localStorage.removeItem("legium_clients");
    localStorage.removeItem("legium_cases");
    localStorage.removeItem("legium_logs");
    localStorage.removeItem("legium_financials");
    localStorage.removeItem("legium_current_user");
    this.initialize();
  },

  getCurrentUser: function(): User {
    const data = localStorage.getItem("legium_current_user");
    return data ? JSON.parse(data) as User : DEFAULT_USERS[3];
  },

  setCurrentUser: function(user: User): void {
    localStorage.setItem("legium_current_user", JSON.stringify(user));
    this.addLog(user.id, `Simulación de cambio de usuario a ${user.name} (${user.role})`, "Success");
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
  }
};
