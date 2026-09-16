/**
 * 路径行：上级钮 + YoAddressField。地址策略在库内，本槽不 import 交互函数、不自造输入。
 */

import { YoAddressField, YoIconButton, type YoAddressFieldApi } from "@yohu/ui";

import { listingStore } from "./listing";
import { parentWithinSafety, splitPath } from "./model";

export type AddressSlotApi = YoAddressFieldApi;

export function AddressSlot(props: { api?: (slot: AddressSlotApi) => void }) {
  let field: AddressSlotApi | undefined;
  return (
    <div class="yohu-files__path">
      <span data-address="up">
        <YoIconButton
          icon="chevron-up"
          title="上级目录"
          disabled={parentWithinSafety(listingStore.session.path) === null}
          onClick={() => {
            field?.close();
            void listingStore.goUp();
          }}
        />
      </span>
      <YoAddressField
        path={listingStore.session.path}
        segments={splitPath(listingStore.session.path)}
        inputLabel="设备路径"
        onNavigate={(path) => {
          void listingStore.navigate(path);
        }}
        onCommit={(value) => listingStore.goTo(value)}
        api={(slot) => {
          field = slot;
          props.api?.(slot);
        }}
      />
    </div>
  );
}
