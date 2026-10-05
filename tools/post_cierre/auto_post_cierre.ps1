# auto_post_cierre.ps1 — lo lanza la tarea programada "Aurum\post_cierre automatico"
# (cada hora, al iniciar sesion y al volver de suspension).
#
# Solo ejecuta `post_cierre.py --subir` si el MT5 de MT5_TERMINAL_PATH ya esta
# abierto: si no, apunta una linea en el log y sale sin hacer nada. Nunca abre
# MT5 (mt5.initialize() lo lanzaria si no estuviera abierto; por eso se mira
# antes aqui). Todo va a salida\auto.log.

$ErrorActionPreference = 'Stop'
$dir    = $PSScriptRoot
$mt5    = 'C:\Users\boli-\AppData\Roaming\MetaTrader 5\terminal64.exe'  # = MT5_TERMINAL_PATH
$python = Join-Path $dir '.venv\Scripts\python.exe'
$log    = Join-Path $dir 'salida\auto.log'

New-Item -ItemType Directory -Force (Split-Path $log) | Out-Null
# Rotacion simple: a partir de 2 MB se guarda como auto.log.1 (se pisa la anterior)
if ((Test-Path $log) -and (Get-Item $log).Length -gt 2MB) {
    Move-Item $log "$log.1" -Force
}

function Log([string]$msg) {
    Add-Content -Path $log -Encoding UTF8 -Value ("{0}  {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg)
}

$abierto = Get-Process -Name terminal64 -ErrorAction SilentlyContinue |
    Where-Object { $_.Path -eq $mt5 }
if (-not $abierto) {
    Log 'MT5 cerrado: no se hace nada.'
    exit 0
}

Log '--- MT5 abierto: post_cierre.py --subir ---'
$env:PYTHONIOENCODING = 'utf-8'
$env:PYTHONWARNINGS   = 'ignore'
Set-Location $dir
$ErrorActionPreference = 'Continue'
# cmd /c para que la salida de python (stdout + stderr) vaya tal cual al log,
# sin que PowerShell 5.1 envuelva stderr en errores.
cmd /c "`"$python`" post_cierre.py --subir >> `"$log`" 2>&1"
$codigo = $LASTEXITCODE
Log ("--- fin (codigo {0}) ---" -f $codigo)
exit $codigo
