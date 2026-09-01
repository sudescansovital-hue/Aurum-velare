-- 1) Crear la columna si no existe (no rompe nada si ya está creada)
ALTER TABLE usuarios_aurum
  ADD COLUMN IF NOT EXISTS tiene_ea BOOLEAN DEFAULT false;

-- 2) Activar el acceso al EA para Roderas
UPDATE usuarios_aurum
SET tiene_ea = true
WHERE email = 'roderastrader@gmail.com';

-- 3) Verificar que quedó bien
SELECT email, tiene_ea FROM usuarios_aurum WHERE email = 'roderastrader@gmail.com';
