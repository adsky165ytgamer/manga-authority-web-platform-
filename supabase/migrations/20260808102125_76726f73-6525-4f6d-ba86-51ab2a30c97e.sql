-- Extend organizational roles
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'leader';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'manager';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'sub_manager';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'writer';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'reviewer';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'music_producer';

-- Member profile fields
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role_title TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS contribution TEXT;

-- Manga external publishing link + author
ALTER TABLE public.manga ADD COLUMN IF NOT EXISTS author TEXT;
ALTER TABLE public.manga ADD COLUMN IF NOT EXISTS external_url TEXT;

-- Chapter content: pdf original, extracted/authored text, narration audio
ALTER TABLE public.chapters ADD COLUMN IF NOT EXISTS pdf_url TEXT;
ALTER TABLE public.chapters ADD COLUMN IF NOT EXISTS text_content TEXT;
ALTER TABLE public.chapters ADD COLUMN IF NOT EXISTS audio_url TEXT;
ALTER TABLE public.chapters ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Music (separate from podcast/narration)
CREATE TABLE IF NOT EXISTS public.music (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  artist TEXT,
  description TEXT,
  audio_url TEXT NOT NULL,
  manga_id UUID REFERENCES public.manga(id) ON DELETE SET NULL,
  chapter_id UUID REFERENCES public.chapters(id) ON DELETE SET NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.music TO authenticated;
GRANT ALL ON public.music TO service_role;
ALTER TABLE public.music ENABLE ROW LEVEL SECURITY;
CREATE POLICY "music_select_auth" ON public.music FOR SELECT TO authenticated USING (true);
CREATE POLICY "music_insert_own" ON public.music FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "music_update_own" ON public.music FOR UPDATE TO authenticated USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "music_delete_own" ON public.music FOR DELETE TO authenticated USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Ownership transfer audit trail
CREATE TABLE IF NOT EXISTS public.ownership_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  manga_id UUID NOT NULL REFERENCES public.manga(id) ON DELETE CASCADE,
  from_user UUID NOT NULL,
  to_user UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.ownership_transfers TO authenticated;
GRANT ALL ON public.ownership_transfers TO service_role;
ALTER TABLE public.ownership_transfers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "transfers_select_auth" ON public.ownership_transfers FOR SELECT TO authenticated USING (true);
CREATE POLICY "transfers_insert_owner" ON public.ownership_transfers FOR INSERT TO authenticated WITH CHECK (from_user = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Internal review notes (staff only)
CREATE TABLE IF NOT EXISTS public.reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  manga_id UUID NOT NULL REFERENCES public.manga(id) ON DELETE CASCADE,
  chapter_id UUID REFERENCES public.chapters(id) ON DELETE CASCADE,
  issue TEXT NOT NULL,
  location TEXT,
  issue_type TEXT,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reviews TO authenticated;
GRANT ALL ON public.reviews TO service_role;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reviews_select_staff" ON public.reviews FOR SELECT TO authenticated USING (true);
CREATE POLICY "reviews_insert_auth" ON public.reviews FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "reviews_update_owner" ON public.reviews FOR UPDATE TO authenticated USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "reviews_delete_owner" ON public.reviews FOR DELETE TO authenticated USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- keep updated_at fresh
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$
LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS update_music_updated_at ON public.music;
CREATE TRIGGER update_music_updated_at BEFORE UPDATE ON public.music
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_reviews_updated_at ON public.reviews;
CREATE TRIGGER update_reviews_updated_at BEFORE UPDATE ON public.reviews
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_chapters_updated_at ON public.chapters;
CREATE TRIGGER update_chapters_updated_at BEFORE UPDATE ON public.chapters
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();