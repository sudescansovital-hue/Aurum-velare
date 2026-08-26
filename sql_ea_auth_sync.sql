-- Detección de desfase Token/ea_password entre Supabase/Vercel y el valor
-- pegado en el EA real (ver PENDIENTES_AUDITORIA_260826.md, pendiente #29 —
-- 4 incidentes documentados 01/08, 05/08, 08/08, 26/08 sin causa raíz única).
--
-- Guarda el resultado del ÚLTIMO intento de autenticación del EA por
-- usuario (éxito o fallo), para poder comparar de un vistazo en el panel
-- admin "esperado (Supabase) vs. último recibido" sin esperar a que falte
-- un trade. Ejecutar una sola vez en Supabase.

ALTER TABLE usuarios_aurum ADD COLUMN IF NOT EXISTS ea_ultimo_intento_en TIMESTAMPTZ;
ALTER TABLE usuarios_aurum ADD COLUMN IF NOT EXISTS ea_token_match BOOLEAN;
ALTER TABLE usuarios_aurum ADD COLUMN IF NOT EXISTS ea_password_match BOOLEAN;
ALTER TABLE usuarios_aurum ADD COLUMN IF NOT EXISTS ea_password_ultimo_recibido TEXT;

-- Nota de diseño: NO se guarda el valor completo del Token (EA_SHARED_SECRET)
-- recibido — es un secreto global (alcance: escritura sobre todo el sistema,
-- no solo un usuario) que hoy nunca se expone en la web a propósito. Solo se
-- guarda si coincidió o no (ea_token_match). ea_password sí se guarda en
-- claro porque ya se muestra así en el panel admin hoy (admin.js,
-- adminAbrirEditar) — no es una exposición nueva.

-- Verificación tras ejecutar:
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'usuarios_aurum' AND column_name LIKE 'ea_%'
-- ORDER BY column_name;
