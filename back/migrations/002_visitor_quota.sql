-- =====================================================================
--  Refleja · migración 002: cuotas anti-abuso por visitante
--  Agrega contadores de por vida a la tabla visitor. No contiene secretos.
--  Idempotente (ADD COLUMN IF NOT EXISTS, MariaDB 10.0+).
--  Ejecutar una vez en producción:
--    mysql -u <usuario_db> -p refleja < back/migrations/002_visitor_quota.sql
--  (En despliegues nuevos no hace falta: la app crea la tabla con estas columnas.)
-- =====================================================================
ALTER TABLE visitor
  ADD COLUMN IF NOT EXISTS events_count    INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS run_count       INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS completed_count INT NOT NULL DEFAULT 0;
