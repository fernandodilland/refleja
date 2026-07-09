-- =====================================================================
--  Refleja · Esquema (plantilla pública) para MariaDB 11.x
--  Estadística anónima de experiencia de usuario. Sin datos personales,
--  sin IPs. Identidad de visitante = HMAC de un id aleatorio (pseudónimo).
--  Todas las tablas llevan created_at y updated_at.
--
--  Uso:
--    CREATE DATABASE refleja CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
--    mysql -u refleja -p refleja < seed.sql
-- =====================================================================

SET NAMES utf8mb4;
SET time_zone = '+00:00';   -- guardar todo en UTC

-- ---------------------------------------------------------------------
--  Administradores (login /acceso)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_user (
  id             BIGINT       NOT NULL AUTO_INCREMENT,
  username       VARCHAR(64)  NOT NULL,
  password_hash  VARCHAR(255) NOT NULL,           -- Argon2id (codificado, con salt embebido)
  is_active      TINYINT(1)   NOT NULL DEFAULT 1,
  last_login_at  DATETIME     NULL,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_admin_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
--  Sesiones de admin (refresh tokens, rotables y revocables)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_session (
  id               BIGINT      NOT NULL AUTO_INCREMENT,
  admin_user_id    BIGINT      NOT NULL,
  refresh_jti      CHAR(36)    NOT NULL,
  token_hash       CHAR(64)    NOT NULL,          -- sha256 del refresh JWT
  user_agent_hash  CHAR(64)    NULL,
  expires_at       DATETIME    NOT NULL,
  revoked_at       DATETIME    NULL,
  created_at       DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_refresh_jti (refresh_jti),
  KEY idx_session_user (admin_user_id),
  KEY idx_session_expires (expires_at),
  CONSTRAINT fk_session_user FOREIGN KEY (admin_user_id)
    REFERENCES admin_user (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
--  Visitantes pseudónimos (1 por token estadístico de 30 días)
--  vid_hash = HMAC-SHA256 de un id aleatorio. Nunca la IP.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS visitor (
  id            BIGINT      NOT NULL AUTO_INCREMENT,
  vid_hash      CHAR(64)    NOT NULL,
  country       CHAR(2)     NULL,                 -- CF-IPCountry (solo país)
  device        VARCHAR(16) NULL,                 -- mobile | tablet | desktop
  page_views    INT         NOT NULL DEFAULT 0,
  events_count    INT       NOT NULL DEFAULT 0,   -- cuotas anti-abuso por token
  run_count       INT       NOT NULL DEFAULT 0,
  completed_count INT       NOT NULL DEFAULT 0,
  last_seen_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at    DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_visitor_vid (vid_hash),
  KEY idx_visitor_last_seen (last_seen_at),       -- "en tiempo real"
  KEY idx_visitor_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
--  Intentos de formulario (1 fila por intento) → embudo / flujo / drop-off
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS form_run (
  id                  BIGINT       NOT NULL AUTO_INCREMENT,
  run_uid             CHAR(36)     NOT NULL,
  visitor_id          BIGINT       NULL,
  age_bucket          VARCHAR(16)  NULL,          -- minor | 18-25 | 26-40 | 41+
  flow_type           VARCHAR(8)   NULL,          -- pareja | fam | trab
  started             TINYINT(1)   NOT NULL DEFAULT 0,
  max_step            SMALLINT     NOT NULL DEFAULT 0,
  last_question_id    VARCHAR(32)  NULL,
  completed           TINYINT(1)   NOT NULL DEFAULT 0,
  municipio           VARCHAR(48)  NULL,          -- slug del municipio
  risk_level          VARCHAR(8)   NULL,          -- low | medium | high
  score_psicologica   SMALLINT     NOT NULL DEFAULT 0,
  score_fisica        SMALLINT     NOT NULL DEFAULT 0,
  score_economica     SMALLINT     NOT NULL DEFAULT 0,
  score_patrimonial   SMALLINT     NOT NULL DEFAULT 0,
  score_sexual        SMALLINT     NOT NULL DEFAULT 0,
  score_intimidacion  SMALLINT     NOT NULL DEFAULT 0,
  created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_run_uid (run_uid),
  KEY idx_run_visitor (visitor_id),
  KEY idx_run_flow (flow_type),
  KEY idx_run_municipio (municipio),
  KEY idx_run_completed (completed),
  KEY idx_run_created (created_at),
  KEY idx_run_updated (updated_at),               -- "en tiempo real"
  CONSTRAINT fk_run_visitor FOREIGN KEY (visitor_id)
    REFERENCES visitor (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
--  Contadores por pregunta (embudo agregado, "preguntas más frecuentes")
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS question_stat (
  id              BIGINT      NOT NULL AUTO_INCREMENT,
  question_id     VARCHAR(32) NOT NULL,
  reached_count   BIGINT      NOT NULL DEFAULT 0,
  answered_count  BIGINT      NOT NULL DEFAULT 0,
  created_at      DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_question_id (question_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
--  Rollup diario (series de tiempo)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS daily_metric (
  id              BIGINT   NOT NULL AUTO_INCREMENT,
  metric_date     DATE     NOT NULL,
  page_views      BIGINT   NOT NULL DEFAULT 0,
  form_starts     BIGINT   NOT NULL DEFAULT 0,
  form_completes  BIGINT   NOT NULL DEFAULT 0,
  minors          BIGINT   NOT NULL DEFAULT 0,
  new_visitors    BIGINT   NOT NULL DEFAULT 0,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_metric_date (metric_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
--  Historial de inicios de sesión del panel (/plataforma)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_login (
  id             BIGINT       NOT NULL AUTO_INCREMENT,
  admin_user_id  BIGINT       NULL,
  username       VARCHAR(64)  NOT NULL,
  browser        VARCHAR(40)  NULL,
  os             VARCHAR(40)  NULL,
  device         VARCHAR(16)  NULL,
  country        CHAR(2)      NULL,
  user_agent     VARCHAR(255) NULL,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_login_user (admin_user_id),
  KEY idx_login_created (created_at),
  CONSTRAINT fk_login_user FOREIGN KEY (admin_user_id)
    REFERENCES admin_user (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
--  Alta de un administrador (PLANTILLA — sin credenciales reales)
--  1) Genera el hash Argon2id de la contraseña:
--       cd back && ./venv/bin/python -c "from app.security import hash_password; print(hash_password('TU_PASSWORD'))"
--  2) Pega el hash y ejecuta este INSERT (idempotente):
-- =====================================================================
INSERT INTO admin_user (username, password_hash, is_active)
SELECT 'CAMBIA_USUARIO', 'PEGA_AQUI_EL_HASH_ARGON2ID', 1
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM admin_user WHERE username = 'CAMBIA_USUARIO');

-- Nota: las credenciales reales van en seed.sql / migration.sql (ambos en
-- .gitignore). La app también crea las tablas al arrancar (create_all).
