CREATE TYPE public.manga_status AS ENUM ('ongoing', 'completed', 'hiatus', 'cancelled');
ALTER TABLE public.manga ADD COLUMN status public.manga_status NOT NULL DEFAULT 'ongoing';