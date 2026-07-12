
-- Roles enum and table
CREATE TYPE public.app_role AS ENUM ('admin', 'uploader', 'reader');

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select_auth" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid());

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_roles_select_own" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- Handle new user: create profile + assign role (first user = admin, else reader)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  user_count INT;
  assigned_role app_role;
BEGIN
  INSERT INTO public.profiles (id, username)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)));

  SELECT COUNT(*) INTO user_count FROM public.user_roles;
  IF user_count = 0 THEN
    assigned_role := 'admin';
  ELSE
    assigned_role := 'reader';
  END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, assigned_role);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Manga
CREATE TABLE public.manga (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  genre TEXT,
  cover_image TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.manga TO authenticated;
GRANT ALL ON public.manga TO service_role;
ALTER TABLE public.manga ENABLE ROW LEVEL SECURITY;
CREATE POLICY "manga_select_auth" ON public.manga FOR SELECT TO authenticated USING (true);
CREATE POLICY "manga_insert_uploader" ON public.manga FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND (public.has_role(auth.uid(), 'uploader') OR public.has_role(auth.uid(), 'admin')));
CREATE POLICY "manga_update_own_or_admin" ON public.manga FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "manga_delete_own_or_admin" ON public.manga FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Chapters
CREATE TABLE public.chapters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  manga_id UUID NOT NULL REFERENCES public.manga(id) ON DELETE CASCADE,
  chapter_number NUMERIC NOT NULL,
  chapter_title TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(manga_id, chapter_number)
);
CREATE INDEX chapters_manga_idx ON public.chapters(manga_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chapters TO authenticated;
GRANT ALL ON public.chapters TO service_role;
ALTER TABLE public.chapters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "chapters_select_auth" ON public.chapters FOR SELECT TO authenticated USING (true);
CREATE POLICY "chapters_insert_owner" ON public.chapters FOR INSERT TO authenticated
  WITH CHECK (EXISTS(SELECT 1 FROM public.manga m WHERE m.id = manga_id AND (m.created_by = auth.uid() OR public.has_role(auth.uid(),'admin'))));
CREATE POLICY "chapters_update_owner" ON public.chapters FOR UPDATE TO authenticated
  USING (EXISTS(SELECT 1 FROM public.manga m WHERE m.id = manga_id AND (m.created_by = auth.uid() OR public.has_role(auth.uid(),'admin'))));
CREATE POLICY "chapters_delete_owner" ON public.chapters FOR DELETE TO authenticated
  USING (EXISTS(SELECT 1 FROM public.manga m WHERE m.id = manga_id AND (m.created_by = auth.uid() OR public.has_role(auth.uid(),'admin'))));

-- Pages
CREATE TABLE public.pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id UUID NOT NULL REFERENCES public.chapters(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  page_order INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX pages_chapter_idx ON public.pages(chapter_id, page_order);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pages TO authenticated;
GRANT ALL ON public.pages TO service_role;
ALTER TABLE public.pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pages_select_auth" ON public.pages FOR SELECT TO authenticated USING (true);
CREATE POLICY "pages_insert_owner" ON public.pages FOR INSERT TO authenticated
  WITH CHECK (EXISTS(SELECT 1 FROM public.chapters c JOIN public.manga m ON m.id = c.manga_id WHERE c.id = chapter_id AND (m.created_by = auth.uid() OR public.has_role(auth.uid(),'admin'))));
CREATE POLICY "pages_update_owner" ON public.pages FOR UPDATE TO authenticated
  USING (EXISTS(SELECT 1 FROM public.chapters c JOIN public.manga m ON m.id = c.manga_id WHERE c.id = chapter_id AND (m.created_by = auth.uid() OR public.has_role(auth.uid(),'admin'))));
CREATE POLICY "pages_delete_owner" ON public.pages FOR DELETE TO authenticated
  USING (EXISTS(SELECT 1 FROM public.chapters c JOIN public.manga m ON m.id = c.manga_id WHERE c.id = chapter_id AND (m.created_by = auth.uid() OR public.has_role(auth.uid(),'admin'))));
