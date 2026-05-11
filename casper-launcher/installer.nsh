; NSIS custom installer script for Casper Launcher

!macro customInstall
  ; No inbound firewall rules needed for the Sub PC.
  ; The launcher uses an ephemeral port for UDP discovery,
  ; and the OS stateful firewall automatically permits the Master's response.
!macroend

!macro customUnInstall
!macroend
