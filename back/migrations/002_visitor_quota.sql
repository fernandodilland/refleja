-- =====================================================================
--  Refleja · migración 002: cuotas anti-abuso + idempotencia
--  Agrega contadores de por vida a `visitor` y el registro de preguntas ya
--  contadas a `form_run`. No contiene secretos. Idempotente (MariaDB 10.0+).
--  Normalmente NO hace falta correrlo: la app aplica estas migraciones ligeras
--  sola al reiniciar (init_db). Se incluye por si prefieres hacerlo a mano:
--    mysql -u <usuario_db> -p refleja < back/migrations/002_visitor_quota.sql
-- =====================================================================
ALTER TABLE visitor
  ADD COLUMN IF NOT EXISTS events_count    INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS run_count       INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS completed_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS action_count    INT NOT NULL DEFAULT 0;

ALTER TABLE form_run
  ADD COLUMN IF NOT EXISTS counted JSON NULL;
