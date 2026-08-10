-- Manga Authority backend hardening.
-- This migration intentionally preserves the existing data model and UI-facing roles.

-- Keep the existing first-user-admin model, but make the bootstrap race-safe.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_count INT;
  assigned_role app_role;
  requested_username TEXT;
BEGIN
  requested_username := lower(trim(COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1))));
  IF requested_username IS NULL OR requested_username = '' THEN
    requested_username := 'member_' || substr(NEW.id::text, 1, 8);
  END IF;

  INSERT INTO public.profiles (id, username)
  VALUES (NEW.id, requested_username)
  ON CONFLICT (id) DO NOTHING;

  -- Serialize the bootstrap decision so two simultaneous registrations cannot both become admin.
  PERFORM pg_advisory_xact_lock(874321);
  SELECT COUNT(*) INTO user_count FROM public.user_roles;
  assigned_role := CASE WHEN user_count = 0 THEN 'admin'::app_role ELSE 'reader'::app_role END;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, assigned_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Role helpers. role_title is presentation text; these database roles are authoritative.
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _user_id IS DISTINCT FROM auth.uid() THEN
    RETURN FALSE;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = _role
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.current_user_has_role(_role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.can_manage_content()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('admin','uploader','leader','manager','sub_manager')
  )
$$;

CREATE OR REPLACE FUNCTION public.can_review_internal()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('admin','leader','manager','sub_manager','reviewer')
  )
$$;

CREATE OR REPLACE FUNCTION public.can_manage_music()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('admin','leader','manager','sub_manager','music_producer')
  )
$$;

REVOKE ALL ON FUNCTION public.current_user_has_role(app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_manage_content() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_review_internal() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_manage_music() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_has_role(app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_content() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_review_internal() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_music() TO authenticated;

-- Members need to display official roles. They remain non-editable from the client.
DROP POLICY IF EXISTS "user_roles_select_own" ON public.user_roles;
CREATE POLICY "user_roles_select_auth" ON public.user_roles
  FOR SELECT TO authenticated USING (true);

-- Official role titles are not user-editable. Keep bio/contribution editable by the owner.
CREATE OR REPLACE FUNCTION public.protect_profile_role_title()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role_title IS DISTINCT FROM OLD.role_title
     AND NOT EXISTS (
       SELECT 1 FROM public.user_roles
       WHERE user_id = auth.uid()
         AND role IN ('admin','leader','manager','sub_manager')
     ) THEN
    NEW.role_title := OLD.role_title;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS protect_profile_role_title ON public.profiles;
CREATE TRIGGER protect_profile_role_title
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_profile_role_title();

-- Official authorization for content tables.
DROP POLICY IF EXISTS "manga_insert_uploader" ON public.manga;
CREATE POLICY "manga_insert_content_staff" ON public.manga
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND public.can_manage_content());
DROP POLICY IF EXISTS "manga_update_own_or_admin" ON public.manga;
CREATE POLICY "manga_update_own_or_content_staff" ON public.manga
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.can_manage_content());
DROP POLICY IF EXISTS "manga_delete_own_or_admin" ON public.manga;
CREATE POLICY "manga_delete_own_or_content_staff" ON public.manga
  FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.can_manage_content());

DROP POLICY IF EXISTS "chapters_insert_owner" ON public.chapters;
CREATE POLICY "chapters_insert_owner" ON public.chapters
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.manga m
    WHERE m.id = manga_id AND (m.created_by = auth.uid() OR public.can_manage_content())
  ));
DROP POLICY IF EXISTS "chapters_update_owner" ON public.chapters;
CREATE POLICY "chapters_update_owner" ON public.chapters
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.manga m
    WHERE m.id = manga_id AND (m.created_by = auth.uid() OR public.can_manage_content())
  ));
DROP POLICY IF EXISTS "chapters_delete_owner" ON public.chapters;
CREATE POLICY "chapters_delete_owner" ON public.chapters
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.manga m
    WHERE m.id = manga_id AND (m.created_by = auth.uid() OR public.can_manage_content())
  ));

DROP POLICY IF EXISTS "pages_insert_owner" ON public.pages;
CREATE POLICY "pages_insert_owner" ON public.pages
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.chapters c
    JOIN public.manga m ON m.id = c.manga_id
    WHERE c.id = chapter_id AND (m.created_by = auth.uid() OR public.can_manage_content())
  ));
DROP POLICY IF EXISTS "pages_update_owner" ON public.pages;
CREATE POLICY "pages_update_owner" ON public.pages
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.chapters c
    JOIN public.manga m ON m.id = c.manga_id
    WHERE c.id = chapter_id AND (m.created_by = auth.uid() OR public.can_manage_content())
  ));
DROP POLICY IF EXISTS "pages_delete_owner" ON public.pages;
CREATE POLICY "pages_delete_owner" ON public.pages
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.chapters c
    JOIN public.manga m ON m.id = c.manga_id
    WHERE c.id = chapter_id AND (m.created_by = auth.uid() OR public.can_manage_content())
  ));

WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY chapter_id ORDER BY page_order, id) AS rn
  FROM public.pages
)
UPDATE public.pages p SET page_order = -ranked.rn FROM ranked WHERE p.id = ranked.id;
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY chapter_id ORDER BY page_order DESC, id) AS rn
  FROM public.pages
)
UPDATE public.pages p SET page_order = ranked.rn FROM ranked WHERE p.id = ranked.id;
CREATE UNIQUE INDEX IF NOT EXISTS pages_chapter_page_order_uidx ON public.pages(chapter_id, page_order);

-- Ownership audit must point at real users.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ownership_transfers_from_user_fkey') THEN
    ALTER TABLE public.ownership_transfers
      ADD CONSTRAINT ownership_transfers_from_user_fkey FOREIGN KEY (from_user) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ownership_transfers_to_user_fkey') THEN
    ALTER TABLE public.ownership_transfers
      ADD CONSTRAINT ownership_transfers_to_user_fkey FOREIGN KEY (to_user) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

DROP POLICY IF EXISTS "transfers_select_auth" ON public.ownership_transfers;
CREATE POLICY "transfers_select_auth" ON public.ownership_transfers
  FOR SELECT TO authenticated USING (from_user = auth.uid() OR to_user = auth.uid() OR public.current_user_has_role('admin'));
DROP POLICY IF EXISTS "transfers_insert_owner" ON public.ownership_transfers;
CREATE POLICY "transfers_insert_owner" ON public.ownership_transfers
  FOR INSERT TO authenticated WITH CHECK (from_user = auth.uid() OR public.current_user_has_role('admin'));

-- Atomic database portion of ownership transfer. Storage is moved first by the trusted server function.
CREATE OR REPLACE FUNCTION public.transfer_manga_ownership(
  p_manga_id UUID,
  p_to_user UUID,
  p_from_user UUID,
  p_actor_user UUID,
  p_old_prefix TEXT,
  p_new_prefix TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_owner UUID;
  from_username_snapshot TEXT;
  to_username_snapshot TEXT;
BEGIN
  SELECT created_by INTO current_owner FROM public.manga WHERE id = p_manga_id FOR UPDATE;
  IF current_owner IS NULL THEN RAISE EXCEPTION 'Series not found'; END IF;
  IF current_owner <> p_from_user THEN RAISE EXCEPTION 'Ownership changed while transfer was in progress'; END IF;
  IF p_actor_user <> current_owner AND NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = p_actor_user AND role = 'admin') THEN
    RAISE EXCEPTION 'Not authorized to transfer this series';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_to_user) THEN
    RAISE EXCEPTION 'Target user does not exist';
  END IF;
  IF p_to_user = current_owner THEN RAISE EXCEPTION 'Target is already the owner'; END IF;

  SELECT username INTO from_username_snapshot FROM public.profiles WHERE id = current_owner;
  SELECT username INTO to_username_snapshot FROM public.profiles WHERE id = p_to_user;

  PERFORM set_config('manga_authority.transfer', 'true', true);
  UPDATE public.manga
  SET created_by = p_to_user,
      cover_image = CASE WHEN cover_image IS NULL THEN NULL ELSE replace(cover_image, p_old_prefix, p_new_prefix) END
  WHERE id = p_manga_id;

  UPDATE public.chapters c
  SET pdf_url = CASE WHEN pdf_url IS NULL THEN NULL ELSE replace(pdf_url, p_old_prefix, p_new_prefix) END,
      audio_url = CASE WHEN audio_url IS NULL THEN NULL ELSE replace(audio_url, p_old_prefix, p_new_prefix) END
  WHERE c.manga_id = p_manga_id;

  UPDATE public.pages p
  SET image_url = replace(image_url, p_old_prefix, p_new_prefix)
  FROM public.chapters c
  WHERE c.id = p.chapter_id AND c.manga_id = p_manga_id;

  INSERT INTO public.ownership_transfers(manga_id, from_user, to_user, from_username, to_username)
  VALUES (p_manga_id, current_owner, p_to_user, from_username_snapshot, to_username_snapshot);
  RETURN TRUE;
END;
$$;
REVOKE ALL ON FUNCTION public.transfer_manga_ownership(uuid,uuid,uuid,uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_manga_ownership(uuid,uuid,uuid,uuid,text,text) TO service_role;

-- Internal Review & R&D is actually staff-only.
DROP POLICY IF EXISTS "reviews_select_staff" ON public.reviews;
DROP POLICY IF EXISTS "reviews_insert_auth" ON public.reviews;
DROP POLICY IF EXISTS "reviews_update_owner" ON public.reviews;
DROP POLICY IF EXISTS "reviews_delete_owner" ON public.reviews;
CREATE POLICY "reviews_select_staff" ON public.reviews
  FOR SELECT TO authenticated USING (public.can_review_internal());
CREATE POLICY "reviews_insert_staff" ON public.reviews
  FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid() AND public.can_review_internal());
CREATE POLICY "reviews_update_staff" ON public.reviews
  FOR UPDATE TO authenticated USING (public.can_review_internal());
CREATE POLICY "reviews_delete_staff" ON public.reviews
  FOR DELETE TO authenticated USING (public.can_review_internal());

-- Music archive: only its producer/content managers can mutate it.
DROP POLICY IF EXISTS "music_insert_own" ON public.music;
DROP POLICY IF EXISTS "music_update_own" ON public.music;
DROP POLICY IF EXISTS "music_delete_own" ON public.music;
CREATE POLICY "music_insert_staff" ON public.music
  FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid() AND public.can_manage_music());
CREATE POLICY "music_update_staff" ON public.music
  FOR UPDATE TO authenticated USING (created_by = auth.uid() OR public.can_manage_music());
CREATE POLICY "music_delete_staff" ON public.music
  FOR DELETE TO authenticated USING (created_by = auth.uid() OR public.can_manage_music());

-- Storage lifecycle policies.
DROP POLICY IF EXISTS "manga_insert_uploader" ON storage.objects;
DROP POLICY IF EXISTS "manga_update_own" ON storage.objects;
DROP POLICY IF EXISTS "manga_delete_own" ON storage.objects;
DROP POLICY IF EXISTS "manga_read_auth" ON storage.objects;

CREATE POLICY "manga_read_auth" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'manga');

CREATE POLICY "manga_insert_content_staff" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'manga'
    AND split_part(name, '/', 1) = auth.uid()::text
    AND COALESCE((metadata->>'size')::bigint, 0) <= 52428800
    AND (
      ((COALESCE(metadata->>'mimetype', '') LIKE 'image/%' OR COALESCE(metadata->>'mimetype', '') = 'application/pdf') AND public.can_manage_content())
      OR (COALESCE(metadata->>'mimetype', '') LIKE 'audio/%' AND public.can_manage_music())
    )
  );

CREATE POLICY "manga_update_owner" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'manga'
    AND (
      split_part(name, '/', 1) = auth.uid()::text
      OR owner = auth.uid()
      OR public.current_user_has_role('admin')
      OR EXISTS (
        SELECT 1 FROM public.manga m
        WHERE m.created_by = auth.uid()
          AND split_part(name, '/', 3) = m.id::text
      )
    )
  );

CREATE POLICY "manga_delete_owner" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'manga'
    AND (
      split_part(name, '/', 1) = auth.uid()::text
      OR owner = auth.uid()
      OR public.current_user_has_role('admin')
      OR EXISTS (
        SELECT 1 FROM public.manga m
        WHERE m.created_by = auth.uid()
          AND split_part(name, '/', 3) = m.id::text
      )
    )
  );

-- Prevent users from inventing an official role title in their profile.
-- Normalize displayed role titles after the protection trigger is installed.
ALTER TABLE public.profiles DISABLE TRIGGER protect_profile_role_title;
UPDATE public.profiles p
SET role_title = CASE
  WHEN r.role = 'leader' THEN 'Leader / Author'
  WHEN r.role = 'manager' THEN 'Manager'
  WHEN r.role = 'sub_manager' THEN 'Sub-Manager'
  WHEN r.role = 'writer' THEN 'Writer'
  WHEN r.role = 'reviewer' THEN 'Reviewer'
  WHEN r.role = 'music_producer' THEN 'Music Producer'
  WHEN r.role = 'admin' THEN 'Administrator'
  WHEN r.role = 'uploader' THEN 'Uploader'
  ELSE 'Member'
END
FROM (
  SELECT DISTINCT ON (user_id) user_id, role
  FROM public.user_roles
  ORDER BY user_id,
    CASE role
      WHEN 'leader' THEN 1 WHEN 'admin' THEN 2 WHEN 'manager' THEN 3 WHEN 'sub_manager' THEN 4
      WHEN 'writer' THEN 5 WHEN 'reviewer' THEN 6 WHEN 'music_producer' THEN 7
      WHEN 'uploader' THEN 8 ELSE 9 END
) r
WHERE p.id = r.user_id;
ALTER TABLE public.profiles ENABLE TRIGGER protect_profile_role_title;

-- Query indexes used by the library, account, podcast, music and internal boards.
CREATE INDEX IF NOT EXISTS manga_created_at_idx ON public.manga(created_at DESC);
CREATE INDEX IF NOT EXISTS manga_created_by_idx ON public.manga(created_by);
CREATE INDEX IF NOT EXISTS chapters_created_at_idx ON public.chapters(created_at DESC);
CREATE INDEX IF NOT EXISTS music_created_at_idx ON public.music(created_at DESC);
CREATE INDEX IF NOT EXISTS music_created_by_idx ON public.music(created_by);
CREATE INDEX IF NOT EXISTS reviews_created_at_idx ON public.reviews(created_at DESC);
CREATE INDEX IF NOT EXISTS profiles_created_at_idx ON public.profiles(created_at);

-- Preserve ownership audit history even after a member deletes their account.
ALTER TABLE public.ownership_transfers
  ADD COLUMN IF NOT EXISTS from_username TEXT,
  ADD COLUMN IF NOT EXISTS to_username TEXT;
ALTER TABLE public.ownership_transfers
  ALTER COLUMN from_user DROP NOT NULL,
  ALTER COLUMN to_user DROP NOT NULL;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ownership_transfers_from_user_fkey') THEN
    ALTER TABLE public.ownership_transfers DROP CONSTRAINT ownership_transfers_from_user_fkey;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ownership_transfers_to_user_fkey') THEN
    ALTER TABLE public.ownership_transfers DROP CONSTRAINT ownership_transfers_to_user_fkey;
  END IF;
  ALTER TABLE public.ownership_transfers
    ADD CONSTRAINT ownership_transfers_from_user_fkey FOREIGN KEY (from_user) REFERENCES auth.users(id) ON DELETE SET NULL;
  ALTER TABLE public.ownership_transfers
    ADD CONSTRAINT ownership_transfers_to_user_fkey FOREIGN KEY (to_user) REFERENCES auth.users(id) ON DELETE SET NULL;
END $$;

-- Keep the display title synchronized with the authoritative role table.
CREATE OR REPLACE FUNCTION public.sync_profile_role_title()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_user UUID := COALESCE(NEW.user_id, OLD.user_id);
  selected_role app_role;
BEGIN
  SELECT role INTO selected_role
  FROM public.user_roles
  WHERE user_id = target_user
  ORDER BY CASE role
    WHEN 'leader' THEN 1 WHEN 'admin' THEN 2 WHEN 'manager' THEN 3 WHEN 'sub_manager' THEN 4
    WHEN 'writer' THEN 5 WHEN 'reviewer' THEN 6 WHEN 'music_producer' THEN 7
    WHEN 'uploader' THEN 8 ELSE 9 END
  LIMIT 1;

  UPDATE public.profiles
  SET role_title = CASE selected_role
    WHEN 'leader' THEN 'Leader / Author'
    WHEN 'admin' THEN 'Administrator'
    WHEN 'manager' THEN 'Manager'
    WHEN 'sub_manager' THEN 'Sub-Manager'
    WHEN 'writer' THEN 'Writer'
    WHEN 'reviewer' THEN 'Reviewer'
    WHEN 'music_producer' THEN 'Music Producer'
    WHEN 'uploader' THEN 'Uploader'
    ELSE 'Member'
  END
  WHERE id = target_user;
  RETURN COALESCE(NEW, OLD);
END;
$$;
DROP TRIGGER IF EXISTS sync_profile_role_title ON public.user_roles;
CREATE TRIGGER sync_profile_role_title
AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.sync_profile_role_title();

-- Usernames are the login identifier in this internal authentication model, so they must be immutable.
CREATE OR REPLACE FUNCTION public.protect_profile_username()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.username IS DISTINCT FROM OLD.username THEN
    NEW.username := OLD.username;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS protect_profile_username ON public.profiles;
CREATE TRIGGER protect_profile_username
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_profile_username();

-- Ownership changes must go through the storage-aware transfer function.
CREATE OR REPLACE FUNCTION public.protect_manga_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.created_by IS DISTINCT FROM OLD.created_by
     AND current_setting('manga_authority.transfer', true) IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'Use the ownership transfer workflow to change the series owner';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS protect_manga_owner ON public.manga;
CREATE TRIGGER protect_manga_owner
BEFORE UPDATE ON public.manga
FOR EACH ROW EXECUTE FUNCTION public.protect_manga_owner();

-- Audit records are system-generated; members must not be able to forge transfer history.
REVOKE INSERT ON public.ownership_transfers FROM authenticated;
DROP POLICY IF EXISTS "transfers_insert_owner" ON public.ownership_transfers;

CREATE OR REPLACE FUNCTION public.can_manage_any_content()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('admin','leader','manager','sub_manager')
  )
$$;
REVOKE ALL ON FUNCTION public.can_manage_any_content() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_any_content() TO authenticated;

DROP POLICY IF EXISTS "manga_insert_content_staff" ON storage.objects;
CREATE POLICY "manga_insert_content_staff" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'manga'
    AND split_part(name, '/', 1) = auth.uid()::text
    AND COALESCE((metadata->>'size')::bigint, 0) <= 52428800
    AND (
      (
        (COALESCE(metadata->>'mimetype', '') LIKE 'image/%' OR COALESCE(metadata->>'mimetype', '') = 'application/pdf')
        AND (
          EXISTS (
            SELECT 1 FROM public.manga m
            WHERE split_part(name, '/', 2) = 'manga'
              AND split_part(name, '/', 3) = m.id::text
              AND (m.created_by = auth.uid() OR public.can_manage_any_content())
          )
        )
      )
      OR (
        COALESCE(metadata->>'mimetype', '') LIKE 'audio/%'
        AND (
          split_part(name, '/', 2) = 'music' AND public.can_manage_music()
          OR split_part(name, '/', 2) = 'manga' AND EXISTS (
            SELECT 1 FROM public.manga m
            WHERE split_part(name, '/', 3) = m.id::text
              AND (m.created_by = auth.uid() OR public.can_manage_any_content())
          )
        )
      )
    )
  );

-- Review notes cannot point at a chapter belonging to another series.
DROP POLICY IF EXISTS "reviews_insert_staff" ON public.reviews;
DROP POLICY IF EXISTS "reviews_update_staff" ON public.reviews;
CREATE POLICY "reviews_insert_staff" ON public.reviews
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND public.can_review_internal()
    AND (
      chapter_id IS NULL
      OR EXISTS (SELECT 1 FROM public.chapters c WHERE c.id = chapter_id AND c.manga_id = reviews.manga_id)
    )
  );
CREATE POLICY "reviews_update_staff" ON public.reviews
  FOR UPDATE TO authenticated
  USING (public.can_review_internal())
  WITH CHECK (
    public.can_review_internal()
    AND (
      chapter_id IS NULL
      OR EXISTS (SELECT 1 FROM public.chapters c WHERE c.id = chapter_id AND c.manga_id = reviews.manga_id)
    )
  );

-- Music links must remain internally consistent when a track is attached to both a manga and chapter.
CREATE OR REPLACE FUNCTION public.validate_music_links()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.chapter_id IS NOT NULL AND NEW.manga_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.chapters c
       WHERE c.id = NEW.chapter_id AND c.manga_id = NEW.manga_id
     ) THEN
    RAISE EXCEPTION 'Music chapter does not belong to the selected manga';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS validate_music_links ON public.music;
CREATE TRIGGER validate_music_links
BEFORE INSERT OR UPDATE ON public.music
FOR EACH ROW EXECUTE FUNCTION public.validate_music_links();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chapters_positive_number') THEN
    ALTER TABLE public.chapters ADD CONSTRAINT chapters_positive_number CHECK (chapter_number > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pages_positive_order') THEN
    ALTER TABLE public.pages ADD CONSTRAINT pages_positive_order CHECK (page_order > 0);
  END IF;
END $$;