-- ==========================================
-- LEGIUM DATABASE SCHEMA FOR INSFORGE
-- ==========================================

-- 1. CREACIÓN DE LA TABLA DE EXPEDIENTES (CASES)
CREATE TABLE IF NOT EXISTS public.cases (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    client_id TEXT NOT NULL,
    client_name TEXT NOT NULL,
    opposing_party TEXT NOT NULL,
    opposing_lawyer TEXT,
    practice_area TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Activo',
    court TEXT,
    judge TEXT,
    assigned_lawyer_id TEXT,
    assigned_lawyer_name TEXT,
    start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    description TEXT,
    timeline JSONB DEFAULT '[]'::jsonb,
    tasks JSONB DEFAULT '[]'::jsonb,
    notes JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilitar RLS en cases
ALTER TABLE public.cases ENABLE ROW LEVEL SECURITY;

-- Crear políticas de acceso libre para prototipo
CREATE POLICY "Allow public select cases" ON public.cases FOR SELECT USING (true);
CREATE POLICY "Allow public insert cases" ON public.cases FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update cases" ON public.cases FOR UPDATE USING (true);


-- 2. CREACIÓN DE LA TABLA DE DOCUMENTOS (DOCUMENTS)
CREATE TABLE IF NOT EXISTS public.documents (
    id TEXT PRIMARY KEY,
    case_id TEXT REFERENCES public.cases(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    size_kb NUMERIC NOT NULL,
    upload_date DATE NOT NULL DEFAULT CURRENT_DATE,
    ocr_text TEXT,
    pdf_url TEXT,
    pdf_key TEXT, -- Add storage key for InsForge
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilitar RLS en documents
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- Crear políticas de acceso libre para prototipo
CREATE POLICY "Allow public select documents" ON public.documents FOR SELECT USING (true);
CREATE POLICY "Allow public insert documents" ON public.documents FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update documents" ON public.documents FOR UPDATE USING (true);
CREATE POLICY "Allow public delete documents" ON public.documents FOR DELETE USING (true);

-- Crear índices para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_documents_case_id ON public.documents(case_id);
CREATE INDEX IF NOT EXISTS idx_cases_client_id ON public.cases(client_id);


-- 3. CREACIÓN DE LA TABLA DE NOTIFICACIONES (NOTIFICATIONS)
CREATE TABLE IF NOT EXISTS public.notifications (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    date TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    read BOOLEAN DEFAULT false NOT NULL,
    case_id TEXT REFERENCES public.cases(id) ON DELETE CASCADE,
    target_role TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilitar RLS en notifications
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Crear políticas de acceso libre para prototipo
CREATE POLICY "Allow public select notifications" ON public.notifications FOR SELECT USING (true);
CREATE POLICY "Allow public insert notifications" ON public.notifications FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update notifications" ON public.notifications FOR UPDATE USING (true);


-- 4. CREACIÓN DE LA TABLA DE USUARIOS (USERS) — login de la aplicación
-- NOTA: prototipo sin hashing, password en texto plano, RLS abierta con anon key
-- pública (mismo patrón/limitación que cases/documents/notifications).
CREATE TABLE IF NOT EXISTS public.users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    name TEXT NOT NULL,
    email TEXT,
    role TEXT NOT NULL,
    active BOOLEAN DEFAULT true NOT NULL,
    avatar TEXT,
    client_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public select users" ON public.users FOR SELECT USING (true);
CREATE POLICY "Allow public insert users" ON public.users FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update users" ON public.users FOR UPDATE USING (true);

CREATE INDEX IF NOT EXISTS idx_users_username ON public.users(username);

INSERT INTO public.users (id, username, password, name, email, role, active, avatar, client_id)
VALUES
  ('usr-01', 'abogado', 'abogado', 'Dr. Carlos Mendoza', 'carlos.mendoza@legium.law', 'Socio Principal', true, 'CM', NULL),
  ('usr-06', 'cliente', 'cliente', 'Ing. Luis Fuentes', 'lfuentes@constructoraalfa.com', 'Cliente', true, 'LF', 'cli-01')
ON CONFLICT (id) DO UPDATE SET
  username = EXCLUDED.username, password = EXCLUDED.password, name = EXCLUDED.name,
  email = EXCLUDED.email, role = EXCLUDED.role, active = EXCLUDED.active,
  avatar = EXCLUDED.avatar, client_id = EXCLUDED.client_id;
