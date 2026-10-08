/**
 * 后台任务 store（状态栏展示；core TaskCenter 的事件镜像）。
 */

import { createStore } from "solid-js/store";

import { errorText, onTaskSummary, taskList, YoLog } from "@yohu/api";
import type { TaskInfo } from "@yohu/api";

export interface TaskStore {
  tasks: TaskInfo[];
}

export function createTaskStore() {
  const [state, setState] = createStore<TaskStore>({ tasks: [] });

  function bindIpc(): void {
    void onTaskSummary((e) => {
      setState("tasks", e.tasks);
    });
  }

  async function load(): Promise<void> {
    try {
      setState("tasks", await taskList());
    } catch (e) {
      YoLog.error("task", "读取任务列表失败", errorText(e));
    }
  }

  return { state, bindIpc, load };
}

export type TaskStoreApi = ReturnType<typeof createTaskStore>;
