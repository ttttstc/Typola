!macro NSIS_HOOK_POSTINSTALL
  DetailPrint "Checking Microsoft Edge WebView2 Runtime..."

  ClearErrors
  ReadRegStr $0 HKCU "Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" "pv"
  ${If} $0 != ""
    DetailPrint "WebView2 Runtime already installed for current user: $0"
    Goto webview2_done
  ${EndIf}

  ClearErrors
  ReadRegStr $0 HKLM "SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" "pv"
  ${If} $0 != ""
    DetailPrint "WebView2 Runtime already installed for this machine: $0"
    Goto webview2_done
  ${EndIf}

  ${If} ${FileExists} "$INSTDIR\resources\MicrosoftEdgeWebview2Setup.exe"
    DetailPrint "Installing Microsoft Edge WebView2 Runtime..."
    ExecWait '"$INSTDIR\resources\MicrosoftEdgeWebview2Setup.exe" /silent /install' $0
    ${If} $0 == 0
      DetailPrint "WebView2 Runtime installed successfully."
    ${Else}
      MessageBox MB_ICONEXCLAMATION "Typola needs Microsoft Edge WebView2 Runtime. The bundled installer returned code $0. Please install WebView2 Runtime manually and launch Typola again."
    ${EndIf}
  ${Else}
    MessageBox MB_ICONEXCLAMATION "Typola needs Microsoft Edge WebView2 Runtime, but the bundled WebView2 installer was not found. Please install WebView2 Runtime manually and launch Typola again."
  ${EndIf}

  webview2_done:
!macroend
