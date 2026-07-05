-- ==========================================
-- LEGIUM DATABASE SCHEMA FOR SUPABASE
-- Copia y pega este script en el editor SQL de tu panel de Supabase
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


-- 3. CONFIGURACIÓN DE STORAGE BUCKETS (Para archivos PDF)
-- Nota: Esto creará el bucket 'legal-documents' de forma pública.

INSERT INTO storage.buckets (id, name, public) 
VALUES ('legal-documents', 'legal-documents', true)
ON CONFLICT (id) DO NOTHING;

-- Crear políticas de seguridad para el Storage de PDFs
-- Permitir lecturas públicas anónimas de los PDFs
CREATE POLICY "Give access to read PDFs"
ON storage.objects FOR SELECT
USING (bucket_id = 'legal-documents');

-- Permitir inserciones/subidas anónimas al bucket
CREATE POLICY "Allow anonymous uploads to legal-documents"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'legal-documents');

-- Permitir actualizaciones anónimas (sobreescritura)
CREATE POLICY "Allow anonymous updates to legal-documents"
ON storage.objects FOR UPDATE
USING (bucket_id = 'legal-documents');


-- 4. CREACIÓN DE LA TABLA DE NOTIFICACIONES (NOTIFICATIONS)
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
