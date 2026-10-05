' Lanza auto_post_cierre.ps1 sin abrir ninguna ventana (la usa la tarea programada).
Set fso = CreateObject("Scripting.FileSystemObject")
ps1 = fso.GetParentFolderName(WScript.ScriptFullName) & "\auto_post_cierre.ps1"
Set sh = CreateObject("WScript.Shell")
WScript.Quit sh.Run("powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File """ & ps1 & """", 0, True)
