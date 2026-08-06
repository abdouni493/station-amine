-- ═══════════════════════════════════════════════════════════════════════════════
--  Migration — Piste rattachée au PISTOLET
-- ───────────────────────────────────────────────────────────────────────────────
--  À exécuter sur une base déjà installée (Supabase → SQL Editor → Run).
--  Rejouable sans risque. Elle est déjà incluse dans supabase_full_setup.sql :
--  relancer le script complet a exactement le même effet.
--
--  Ce qu'elle ajoute : `pump_nozzles.track_id`. La page Pistes peut désormais
--  rattacher des PISTOLETS à une piste, et plus seulement des pompes. Laissée
--  vide, la colonne fait suivre au pistolet la piste de sa pompe — la piste
--  effective est donc `coalesce(nozzle.track_id, pump.track_id)`.
--
--  Aucune donnée existante n'est modifiée : toutes les lignes reçoivent NULL et
--  continuent donc de suivre leur pompe, exactement comme avant.
-- ═══════════════════════════════════════════════════════════════════════════════

alter table public.pump_nozzles
  add column if not exists track_id uuid references public.tracks(id) on delete set null;

create index if not exists idx_nozzles_pump  on public.pump_nozzles(pump_id);
create index if not exists idx_nozzles_track on public.pump_nozzles(track_id);
