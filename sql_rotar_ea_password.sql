-- Rotacion de ea_password para roderastrader@gmail.com
-- Motivo: la ea_password anterior quedo expuesta en texto plano durante las
-- pruebas manuales de /api/trade-evento (fase 2 del brief de linea de tiempo
-- EA). Mismo mecanismo que sql_ea_password.sql, pero forzando el reemplazo
-- (sin el WHERE ea_password IS NULL, porque aqui ya tiene una puesta).
--
-- IMPORTANTE: ea_password es compartida por /api/trade-mt5 y /api/trade-evento.
-- En cuanto se ejecute este UPDATE, el EA real en MT5 (Roderas) empezara a
-- fallar con 401 en ambos endpoints hasta que se le ponga el valor nuevo
-- tambien ahi. Coordinar con la actualizacion del EA (fase 3).

-- 1) Rotar
UPDATE usuarios_aurum
SET ea_password = md5(random()::text || clock_timestamp()::text)
WHERE email = 'roderastrader@gmail.com';

-- 2) Copiar el valor nuevo (solo para pegarlo en el input del EA en MT5 -
--    no hace falta reenviarmelo a mi por el chat)
SELECT email, ea_password FROM usuarios_aurum WHERE email = 'roderastrader@gmail.com';
