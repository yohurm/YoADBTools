/**
 * 指定命令组：用 commandlib.load 的组名做勾选。
 * 不 import 终端模块。未知 id 留在策略里，这里只画当前库。
 */

import { For, Show, createSignal, onMount, type JSX } from "solid-js";

import {
  commandlibLoad,
  libraryExpandHasGroup,
  libraryExpandWithGroup,
  type CommandGroupDto,
  type LibraryExpand,
} from "@yohu/api";
import { YoCheckbox } from "@yohu/ui";

export function LibraryExpandGroups(props: {
  policy: LibraryExpand;
  onChange: (next: LibraryExpand) => void;
}): JSX.Element {
  const [groups, setGroups] = createSignal<CommandGroupDto[] | null>(null);
  const [failed, setFailed] = createSignal(false);

  onMount(() => {
    void commandlibLoad()
      .then((library) => {
        setFailed(false);
        setGroups(library.groups);
      })
      .catch(() => {
        setFailed(true);
        setGroups([]);
      });
  });

  return (
    <Show when={groups()} fallback={<span class="yohu-settings__hint">读取命令库</span>}>
      {(loaded) => (
        <Show
          when={!failed() && loaded().length > 0}
          fallback={
            <span class="yohu-settings__hint">{failed() ? "无法读取命令库" : "命令库为空"}</span>
          }
        >
          <div class="yohu-settings__checks">
            <For each={loaded()}>
              {(group) => (
                <YoCheckbox
                  label={group.name}
                  checked={libraryExpandHasGroup(props.policy, group.id)}
                  onChange={(on) => props.onChange(libraryExpandWithGroup(props.policy, group.id, on))}
                />
              )}
            </For>
          </div>
        </Show>
      )}
    </Show>
  );
}
