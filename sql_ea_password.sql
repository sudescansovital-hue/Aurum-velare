-- 1) Crear la columna si no existe (no rompe nada si ya está creada)
ALTER TABLE usuarios_aurum
  ADD COLUMN IF NOT EXISTS ea_password TEXT;

-- 2) Generar la contraseña de Roderas (solo si aún no tiene una)
UPDATE usuarios_aurum
SET ea_password = md5(random()::text || clock_timestamp()::text)
WHERE email = 'roderastrader@gmail.com' AND ea_password IS NULL;

-- 3) Verificar y copiar la contraseña generada (la necesitarás en la fase 3, para pegarla en el input del EA)
SELECT email, ea_password FROM usuarios_aurum WHERE email = 'roderastrader@gmail.com';
