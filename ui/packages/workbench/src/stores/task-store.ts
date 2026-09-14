/**
 * 后台任务 store（状态栏展示；core TaskCenter 的事件镜像）。
 */

import { createStore } from "solid-js/store";

import { onTaskSummary } from "@yohu/api";
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

  return { state, bindIpc };
}

export type TaskStoreApi = ReturnType<typeof createTaskStore>;
