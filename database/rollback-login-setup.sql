-- ============================================
-- ROLLBACK: REVERTIR CAMBIOS DE MIGRACIÓN
-- ============================================
-- Este script revierte los cambios hechos por la migración
-- Úsalo si algo salió mal y necesitas volver atrás
-- 
-- Advertencia: Esto eliminará las nuevas tablas pero
-- NO afectará los datos existentes en otras tablas
-- ============================================

BEGIN;

-- Eliminar índices
DROP INDEX IF EXISTS idx_login_attempts_email;
DROP INDEX IF EXISTS idx_login_attempts_timestamp;
DROP INDEX IF EXISTS idx_password_reset_user;
DROP INDEX IF EXISTS idx_password_reset_token;
DROP INDEX IF EXISTS idx_user_sessions_user;
DROP INDEX IF EXISTS idx_user_sessions_token;
DROP INDEX IF EXISTS idx_user_sessions_activa;

-- Eliminar tablas (en orden de dependencias)
DROP TABLE IF EXISTS user_sessions CASCADE;
DROP TABLE IF EXISTS password_reset_tokens CASCADE;
DROP TABLE IF EXISTS login_attempts CASCADE;

-- Eliminar columnas agregadas a users (opcional, descomentar si se necesita)
-- ALTER TABLE users DROP COLUMN IF EXISTS verificado;
-- ALTER TABLE users DROP COLUMN IF EXISTS ultimo_login_fallido;
-- ALTER TABLE users DROP COLUMN IF EXISTS intentos_login_fallidos;
-- ALTER TABLE users DROP COLUMN IF EXISTS bloqueado_hasta;
-- ALTER TABLE users DROP COLUMN IF EXISTS email_verificado_en;

-- Eliminar usuario admin de prueba (opcional, descomentar si se necesita)
-- DELETE FROM user_roles WHERE user_id = (SELECT id FROM users WHERE email = 'admin@zentra.com');
-- DELETE FROM users WHERE email = 'admin@zentra.com';

COMMIT;

SELECT '✅ ROLLBACK COMPLETADO' AS resultado;
