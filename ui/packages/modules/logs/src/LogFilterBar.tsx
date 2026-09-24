/**
 * 过滤条：级别分段 / Tag Chip / 关键字。变更走 store.patchFilter。
 */

import type { JSX } from "solid-js";

import {
  YoBadge,
  YoChip,
  YoListPresence,
  YoSearch,
  YoSegmentedButton,
  YoTextField,
  type YoSearchControl,
} from "@yohu/ui";

import {
  LEVELS,
  joinTagInput,
  levelKey,
  levelLabel,
  normalizeLevels,
  removeTagNeedle,
  splitTagInput,
  tagFilterActive,
} from "./filter";
import { logStore } from "./store";
import type { LogSessionState } from "./workspace";

function TagFilterField(props: { session: LogSessionState }) {
  const parsed = (): ReturnType<typeof splitTagInput> => splitTagInput(props.session.tagContains);
  const write = (raw: string): void => {
    logStore.patchFilter(props.session.id, { tagContains: raw });
  };
  return (
    <YoTextField
      block
      ariaLabel="Tag，逗号分隔，多针匹配"
      placeholder={parsed().committed.length > 0 ? "" : "Tag，逗号分隔"}
      value={parsed().draft}
      tokens={
        parsed().committed.length > 0 ? (
          <YoListPresence each={parsed().committed} key={(tag) => tag} recipe="chip">
            {(tag) => (
              <YoChip
                text={tag}
                onDismiss={() => write(removeTagNeedle(props.session.tagContains, tag))}
              />
            )}
          </YoListPresence>
        ) : undefined
      }
      active={tagFilterActive(props.session.tagContains)}
      onInput={(v) => {
        const { committed } = parsed();
        const typed = splitTagInput(v);
        write(joinTagInput([...committed, ...typed.committed], typed.draft));
      }}
      onKeyDown={(event) => {
        const { committed, draft } = parsed();
        if (event.key === "Backspace" && draft.length === 0 && committed.length > 0) {
          event.preventDefault();
          write(joinTagInput(committed.slice(0, -1), ""));
        }
        if (event.key === "Enter" && draft.length > 0) {
          event.preventDefault();
          write(joinTagInput([...committed, draft], ""));
        }
      }}
    />
  );
}

function scopeLabel(session: { scope: { kind: string; pkg?: string; pid?: number } }): string {
  if (session.scope.kind === "package") return `包名: ${session.scope.pkg}`;
  if (session.scope.kind === "pid") return `PID: ${session.scope.pid}`;
  return "System";
}

const LEVEL_ITEMS = LEVELS.map((letter) => {
  const key = levelKey(letter);
  return {
    value: letter,
    label: letter,
    ariaLabel: levelLabel(letter),
    ink: key ? `var(--yohu-level-${key})` : undefined,
    fill: key ? `var(--yohu-level-${key})` : undefined,
  };
});

export function LogFilterBar(props: {
  session: LogSessionState;
  keywordRef: (el: YoSearchControl) => void;
}): JSX.Element {
  return (
    <div class="yohu-logs__filter">
      <div class="yohu-logs__levels">
        <YoSegmentedButton
          type="capsule"
          multiple
          size="sm"
          ariaLabel="级别"
          items={LEVEL_ITEMS}
          values={[...props.session.levels]}
          onChangeValues={(values) =>
            logStore.patchFilter(props.session.id, { levels: normalizeLevels(values) })
          }
        />
      </div>
      <span class="yohu-logs__field yohu-logs__field--tag">
        <TagFilterField session={props.session} />
      </span>
      <span class="yohu-logs__search yohu-logs__field">
        <YoSearch
          ariaLabel="关键字"
          placeholder="检索消息"
          value={props.session.keyword}
          inputRef={props.keywordRef}
          onInput={(v) => logStore.patchFilter(props.session.id, { keyword: v })}
        />
      </span>
      <span class="yohu-logs__scope">
        <YoBadge text={scopeLabel(props.session)} tone="accent" />
      </span>
    </div>
  );
}
