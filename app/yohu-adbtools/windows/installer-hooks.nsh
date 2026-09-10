; INSTDIR 与产品家园分离（ADR-v6-031）。
; currentUser 默认 $LOCALAPPDATA\${PRODUCTNAME} 会叠在数据根上。
; Tauri installer.nsi 在钩子之前先 SetOutPath $INSTDIR，File 跟 OutPath 不跟 $INSTDIR；
; 改完 INSTDIR 必须再 SetOutPath，否则主程序会落到产品家园。

!macro NSIS_HOOK_PREINSTALL
  StrCpy $INSTDIR "$LOCALAPPDATA\Programs\${PRODUCTNAME}"
  SetOutPath $INSTDIR
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; 旧钩子曾把主程序落到家园；覆盖安装时清掉误放的 exe。
  Delete "$LOCALAPPDATA\${PRODUCTNAME}\${MAINBINARYNAME}.exe"
!macroend

!macro NSIS_HOOK_PREUNINSTALL
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ${If} $DeleteAppDataCheckboxState = 1
  ${AndIf} $UpdateMode <> 1
    RmDir /r "$LOCALAPPDATA\${PRODUCTNAME}"
    RmDir /r "$LOCALAPPDATA\com.yohu.adbtools"
  ${EndIf}
!macroend
