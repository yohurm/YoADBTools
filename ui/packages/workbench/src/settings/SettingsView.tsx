/**
 * 设置面板组合：页壳 + 页眉铬 + 表单 + 更新对话框。
 * 启动已 load 设置；本页不二次 settingsStore.load。关于页不展示通道，不打 update.info。
 */

import { Component, onCleanup } from "solid-js";

import { dialogFailureText, dialogPickAccepted, saveFailedText, ModuleTitle, type DialogPick, type SettingKey } from "@yohu/api";
import { YoChrome, YoPage, YoToaster, createToaster } from "@yohu/ui";

import { deviceStore, settingsStore, updateStore } from "../stores";
import { updateHasNewVersion } from "../stores/update-store";
import { SettingsForm } from "./SettingsForm";
import { UpdateDialogs } from "./UpdateDialogs";
import "./settings.css";

export const SettingsView: Component = () => {
  const toaster = createToaster();
  onCleanup(() => toaster.destroy());

  function successTone() {
    return "success" as const;
  }

  function showFailure(text: string): void {
    toaster.show(text, settingsStore.errorTone());
  }

  function showSuccess(text: string): void {
    toaster.show(text, successTone());
  }

  function showSaveFailed(e: unknown): void {
    showFailure(saveFailedText(deviceStore.caughtText(e)));
  }

  const save = (key: SettingKey, value: unknown, okText: string): void => {
    void settingsStore
      .set(key, value)
      .then(() => showSuccess(okText))
      .catch(showSaveFailed);
  };

  const savedBrowse = (run: () => Promise<DialogPick>, okText: string): void => {
    void run()
      .then((picked) => {
        const failure = dialogFailureText(picked);
        if (failure) showFailure(failure);
        if (!dialogPickAccepted(picked)) return;
        showSuccess(okText);
      })
      .catch(showSaveFailed);
  };

  const checkAppUpdate = async (): Promise<void> => {
    try {
      const result = await updateStore.check();
      if (!updateHasNewVersion(result)) {
        showSuccess("已是最新版本");
      }
    } catch (e) {
      showFailure(deviceStore.caughtText(e));
    }
  };

  return (
    <YoPage role="settings" class="yohu-settings">
      <YoChrome title={ModuleTitle.Settings} />
      <SettingsForm
        save={save}
        savedBrowse={savedBrowse}
        onCheckUpdate={() => void checkAppUpdate()}
      />
      <UpdateDialogs show={(text, tone) => toaster.show(text, tone)} />
      <YoToaster toaster={toaster} />
    </YoPage>
  );
};
