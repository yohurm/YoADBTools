# YoUI Motion 分层（L1–L5）

壳与模块只走 `@yohu/ui` 公开 Yo*。禁止引擎互 import；跨层只经过 `spec/` 与 `reduced.ts`。

```
motion/
  spec/                 L1+L3 目录：时长表、配方目录、Presence/Collapse 名
  reduced.ts            减动效 / 测试跳过
  css.ts                测试读 CSS（解析 @import）
  engines/
    presence/           L2 Presence：进出树
    collapse/           L2 Implicit：0fr/1fr 折叠
    rail/               L2 Implicit：232↔48 图标轨
    travel/             L2 Travel + Reveal：用后 px
    indicator/          L2 Indicator：选中滑块
    swap/               L2 Swap：文案换牌
    theme/              L2 主题圆形揭示
  recipes/              L3 壳配方 CSS（无 Solid）：inline-end / preview / send-aim / dismiss / spin / reorder / scroller
  reduced.css           统一 prefers-reduced-motion
  index.ts              L5 门面（只转发）
```

`tokens/motion.css` 只做 `@import` 桶。关键帧只许 `motion/**/*.css`。

公开 API 名不变。旧 `motion/*.tsx` 可留 3 行 shim，实现必须在 `engines/<layer>/`。
