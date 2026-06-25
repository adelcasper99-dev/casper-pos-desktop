; NSIS custom installer script for Casper POS Master
; Opens necessary ports in Windows Firewall for LAN access.

!macro customInstall
  ; Open TCP port 3001-3010 for the web app
  nsExec::ExecToLog 'powershell -NonInteractive -NoProfile -ExecutionPolicy Bypass -Command "New-NetFirewallRule -DisplayName ''Casper POS Master Web'' -Direction Inbound -Protocol TCP -LocalPort 3000-3010 -Action Allow -Profile Any -ErrorAction SilentlyContinue"'
  ; Open UDP port 55432 for discovery beacon pings
  nsExec::ExecToLog 'powershell -NonInteractive -NoProfile -ExecutionPolicy Bypass -Command "New-NetFirewallRule -DisplayName ''Casper POS Master Discovery'' -Direction Inbound -Protocol UDP -LocalPort 55432 -Action Allow -Profile Any -ErrorAction SilentlyContinue"'

  ; Add PostgreSQL installation, Defender exceptions, and Database init
  DetailPrint "Configuring Windows Defender Exclusions..."
  nsExec::ExecToLog 'powershell -NonInteractive -NoProfile -ExecutionPolicy Bypass -Command "Add-MpPreference -ExclusionPath ''$INSTDIR'' -ErrorAction SilentlyContinue"'
  nsExec::ExecToLog 'powershell -NonInteractive -NoProfile -ExecutionPolicy Bypass -Command "Add-MpPreference -ExclusionPath ''C:\Program Files\PostgreSQL'' -ErrorAction SilentlyContinue"'

  DetailPrint "Configuring Windows Firewall for Port 5432..."
  nsExec::ExecToLog 'powershell -NonInteractive -NoProfile -ExecutionPolicy Bypass -Command "New-NetFirewallRule -DisplayName ''Casper POS Master DB'' -Direction Inbound -Protocol TCP -LocalPort 5432 -Action Allow -Profile Private -ErrorAction SilentlyContinue"'

  IfFileExists "C:\Program Files\PostgreSQL\16\bin\createdb.exe" postgres_installed postgres_not_installed

postgres_not_installed:
  DetailPrint "Installing PostgreSQL Database Engine (This may take a few minutes)..."
  ExecWait '"$INSTDIR\resources\postgresql-setup.exe" --mode unattended --superpassword "postgres" --serverport 5432' $0
  Goto init_db

postgres_installed:
  DetailPrint "PostgreSQL 16 is already installed. Skipping installation to save time."

init_db:
  DetailPrint "Initializing Casper POS Database..."
  DetailPrint "Waiting for PostgreSQL Service to start..."
  nsExec::ExecToLog 'powershell -NonInteractive -NoProfile -ExecutionPolicy Bypass -Command "$timeout = 60; $timer = 0; while(!(Test-NetConnection -ComputerName localhost -Port 5432 -InformationLevel Quiet) -and $timer -lt $timeout) { Start-Sleep -Seconds 1; $timer++ }"'
  System::Call 'Kernel32::SetEnvironmentVariable(t "PGPASSWORD", t "postgres")'
  nsExec::ExecToLog '"C:\Program Files\PostgreSQL\16\bin\createdb.exe" -U postgres -p 5432 casper_pos'
!macroend

!macro customUnInstall
  ; Remove firewall rules on uninstall
  nsExec::ExecToLog 'powershell -NonInteractive -NoProfile -ExecutionPolicy Bypass -Command "Remove-NetFirewallRule -DisplayName ''Casper POS Master Web'' -ErrorAction SilentlyContinue"'
  nsExec::ExecToLog 'powershell -NonInteractive -NoProfile -ExecutionPolicy Bypass -Command "Remove-NetFirewallRule -DisplayName ''Casper POS Master Discovery'' -ErrorAction SilentlyContinue"'
  nsExec::ExecToLog 'powershell -NonInteractive -NoProfile -ExecutionPolicy Bypass -Command "Remove-NetFirewallRule -DisplayName ''Casper POS Master DB'' -ErrorAction SilentlyContinue"'
!macroend
