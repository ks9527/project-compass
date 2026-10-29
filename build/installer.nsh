!macro customInstall
  SetShellVarContext current
  CreateShortCut "$DESKTOP\项目指南针.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0
!macroend
