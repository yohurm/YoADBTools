import type { MotionSpecName } from "../../tokens/motion";

/** L2 引擎。L3 壳配方里一次性播放的归 one-shot。 */
export type MotionEngine = "presence" | "implicit" | "travel" | "grow" | "indicator" | "one-shot";

export type MotionCatalogEntry = {
  name: string;
  engine: MotionEngine;
  spec: MotionSpecName | readonly MotionSpecName[];
  properties: readonly string[];
  interruptible: boolean;
};

/**
 * L3 配方目录：属性 × MotionSpec × 原语。
 * spec 只许已有 MotionSpec 名；rail 固定 spatialRail。
 */
export const MotionCatalog = {
  rail: {
    name: "rail",
    engine: "implicit",
    spec: "spatialRail",
    properties: [
      "width",
      "flex-basis",
      "max-width",
      "grid-template-rows",
      "grid-template-columns",
      "min-height",
      "opacity",
      "transform",
    ],
    interruptible: true,
  },
  collapse: {
    name: "collapse",
    engine: "implicit",
    spec: "spatialLocal",
    properties: ["grid-template-rows"],
    interruptible: true,
  },
  panel: {
    name: "panel",
    engine: "implicit",
    spec: ["spatialStretch", "effectsEnter", "effectsExit"],
    properties: ["grid-template-rows", "opacity", "transform"],
    interruptible: true,
  },
  fill: {
    name: "fill",
    engine: "implicit",
    spec: "spatialLocal",
    properties: ["grid-template-rows"],
    interruptible: true,
  },
  preview: {
    name: "preview",
    engine: "implicit",
    spec: "spatialPanel",
    properties: ["grid-template-columns"],
    interruptible: true,
  },
  "inline-end": {
    name: "inline-end",
    engine: "implicit",
    spec: ["spatialPanel", "effectsEnter", "effectsExit"],
    properties: ["width", "grid-template-rows", "opacity", "transform"],
    interruptible: true,
  },
  "send-aim": {
    name: "send-aim",
    engine: "implicit",
    spec: "spatialSmall",
    properties: ["transform"],
    interruptible: true,
  },
  swap: {
    name: "swap",
    engine: "implicit",
    spec: "spatialPanel",
    properties: ["width"],
    interruptible: true,
  },
  travel: {
    name: "travel",
    engine: "travel",
    spec: "spatialPanel",
    properties: ["height", "width"],
    interruptible: true,
  },
  grow: {
    name: "grow",
    engine: "grow",
    spec: "spatialGrow",
    properties: ["height"],
    interruptible: true,
  },
  list: {
    name: "list",
    engine: "presence",
    spec: ["spatialLocal", "effectsExit"],
    properties: ["opacity", "transform", "grid-template-rows"],
    interruptible: true,
  },
  chip: {
    name: "chip",
    engine: "presence",
    spec: ["spatialLocal", "effectsExit"],
    properties: ["opacity", "transform", "grid-template-columns"],
    interruptible: true,
  },
  fade: {
    name: "fade",
    engine: "presence",
    spec: ["effectsEnter", "effectsExit"],
    properties: ["opacity"],
    interruptible: false,
  },
  rise: {
    name: "rise",
    engine: "presence",
    spec: ["spatialLocal", "effectsExit"],
    properties: ["opacity", "transform"],
    interruptible: false,
  },
  dialog: {
    name: "dialog",
    engine: "presence",
    spec: ["spatialEnter", "spatialExit"],
    properties: ["opacity", "transform"],
    interruptible: false,
  },
  toast: {
    name: "toast",
    engine: "presence",
    spec: ["spatialRail", "effectsExit"],
    properties: ["grid-template-rows", "opacity", "transform"],
    interruptible: true,
  },
  popover: {
    name: "popover",
    engine: "presence",
    spec: ["spatialLocal", "effectsExit"],
    properties: ["opacity", "transform"],
    interruptible: false,
  },
  indicator: {
    name: "indicator",
    engine: "indicator",
    spec: ["spatialSmall", "spatialStretch"],
    properties: ["transform", "width", "height"],
    interruptible: true,
  },
  selected: {
    name: "selected",
    engine: "implicit",
    spec: ["effectsFast", "spatialTick", "spatialSmall", "spatialStretch", "effectsExit", "spatialLocal"],
    properties: ["opacity", "background-color", "color", "transform", "font-weight"],
    interruptible: true,
  },
  "dismiss-fade": {
    name: "dismiss-fade",
    engine: "one-shot",
    spec: "spatialPanel",
    properties: ["opacity"],
    interruptible: false,
  },
  "theme-wipe": {
    name: "theme-wipe",
    engine: "one-shot",
    spec: "spatialEnter",
    properties: ["clip-path"],
    interruptible: false,
  },
  "tree-chevron": {
    name: "tree-chevron",
    engine: "implicit",
    spec: "spatialSmall",
    properties: ["transform"],
    interruptible: true,
  },
  reorder: {
    name: "reorder",
    engine: "implicit",
    spec: ["spatialSmall", "effectsFast"],
    properties: ["transform", "opacity", "top"],
    interruptible: true,
  },
  scroller: {
    name: "scroller",
    engine: "implicit",
    spec: ["effectsEnter", "effectsExit", "effectsFast"],
    properties: ["opacity", "background-color"],
    interruptible: true,
  },
} as const satisfies Record<string, MotionCatalogEntry>;

export type MotionCatalog = typeof MotionCatalog;
export type MotionRecipeName = keyof MotionCatalog;
