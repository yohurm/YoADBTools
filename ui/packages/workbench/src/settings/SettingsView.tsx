/**
 * 设置面板组合：页壳 + 页眉铬 + 表单 + 更新对话框。
 * 启动已 load 设置；本页不二次 settingsStore.load。
 * 关于页打开读一次更新通道（`update.info`），不进 hydrate。
 */

import { Component, onCleanup, onMount } from "solid-js";

import { dialogFailureText, dialogPickAccepted, saveFailedText, ModuleTitle, type DialogPick, type SettingKey } from "@yohu/api";
import { YoChrome, YoPage, YoToaster, createToaster } from "@yohu/ui";

import { deviceStore, settingsStore, updateStore } from "../stores";
import { updateHasNewVersion } from "../stores/update-store";
import { SettingsForm } from "./SettingsForm";
import { UpdateDialogs } from "./UpdateDialogs";
import "./settings.css";

export const SettingsView: Component = () => {
  const toaster = createToaster();
  onMount(() => {
    void updateStore.loadChannel();
  });
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
        showToast={(text, tone) => toaster.show(text, tone)}
      />
      <UpdateDialogs show={(text, tone) => toaster.show(text, tone)} />
      <YoToaster toaster={toaster} />
    </YoPage>
  );
};
