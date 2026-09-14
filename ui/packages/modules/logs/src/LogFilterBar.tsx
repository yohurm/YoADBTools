/**
 * 过滤条：级别钮 / Tag Chip / 关键字。变更走 store.patchFilter。
 */

import { For } from "solid-js";

import {
  YoBadge,
  YoButton,
  YoChip,
  YoListPresence,
  YoTextField,
  type YoTextFieldControl,
} from "@yohu/ui";

import {
  LEVELS,
  joinTagInput,
  levelKey,
  levelLabel,
  removeTagNeedle,
  splitTagInput,
  tagFilterActive,
  toggleLevel,
} from "./filter";
import { levelInkStyle } from "./level-paint";
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
      ariaLabel="Tag，逗号分隔，精确匹配"
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
      clearable
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

export function LogFilterBar(props: {
  session: LogSessionState;
  keywordRef: (el: YoTextFieldControl) => void;
}) {
  return (
    <div class="yohu-logs__filter">
      <div class="yohu-logs__levels" role="group" aria-label="级别">
        <For each={LEVELS}>
          {(letter) => {
            const pressed = (): boolean => props.session.levels.includes(letter);
            const key = levelKey(letter);
            return (
              <span
                class="yohu-logs__level-slot yohu-tone"
                data-level={key ?? undefined}
                style={key ? levelInkStyle(key) : undefined}
              >
                <YoButton
                  variant="ghost"
                  tone="neutral"
                  size="md"
                  ink
                  flush
                  aria-label={levelLabel(letter)}
                  aria-pressed={pressed()}
                  onClick={() =>
                    logStore.patchFilter(props.session.id, {
                      levels: toggleLevel(props.session.levels, letter),
                    })
                  }
                >
                  {letter}
                </YoButton>
              </span>
            );
          }}
        </For>
      </div>
      <span class="yohu-logs__field yohu-logs__field--tag">
        <TagFilterField session={props.session} />
      </span>
      <span class="yohu-logs__search yohu-logs__field">
        <YoTextField
          block
          prefix="search"
          ariaLabel="关键字"
          placeholder="检索消息"
          value={props.session.keyword}
          clearable
          active={props.session.keyword.length > 0}
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
