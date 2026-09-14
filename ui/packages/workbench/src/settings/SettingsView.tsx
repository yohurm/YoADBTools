/**
 * 设置面板组合：页眉铬 + 表单 + 更新对话框。
 * 启动已 load 设置；本页不二次 settingsStore.load。关于页不展示通道，不打 update.info。
 */

import { Component } from "solid-js";

import { errorText, ModuleTitle, type SettingKey } from "@yohu/api";
import { YoChrome, YoToaster, createToaster } from "@yohu/ui";

import { settingsStore, updateStore } from "../stores";
import { SettingsForm } from "./SettingsForm";
import { UpdateDialogs } from "./UpdateDialogs";
import "./settings.css";

const toaster = createToaster();

export const SettingsView: Component = () => {
  const save = (key: SettingKey, value: unknown, okText: string): void => {
    void settingsStore
      .set(key, value)
      .then(() => toaster.show(okText, "success"))
      .catch((e) => toaster.show(`保存失败: ${errorText(e)}`, "error"));
  };

  const savedBrowse = (run: () => Promise<string | null>, okText: string): void => {
    void run()
      .then((path) => {
        if (path) toaster.show(okText, "success");
      })
      .catch((e) => toaster.show(`保存失败: ${errorText(e)}`, "error"));
  };

  const checkAppUpdate = async (): Promise<void> => {
    try {
      const result = await updateStore.check();
      if (!result.has_new_version) {
        toaster.show("已是最新版本", "success");
      }
    } catch (e) {
      toaster.show(`检查更新失败: ${errorText(e)}`, "error");
    }
  };

  return (
    <div class="yohu-settings">
      <div class="yohu-settings__chrome">
        <YoChrome title={ModuleTitle.Settings} />
      </div>
      <SettingsForm
        save={save}
        savedBrowse={savedBrowse}
        onCheckUpdate={() => void checkAppUpdate()}
      />
      <UpdateDialogs show={(text, tone) => toaster.show(text, tone)} />
      <YoToaster toaster={toaster} />
    </div>
  );
};
