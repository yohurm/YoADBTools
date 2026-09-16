/**
 * Presence 宿主身份（L3）。
 * 视图只绑 data-recipe。不写配方过渡。
 */

import type { PresenceRecipe } from "../../spec/recipes";

export interface PresenceHostAttrs {
  "data-recipe": PresenceRecipe;
}

/** 配方名写成宿主 data-recipe。 */
export function presenceHostRecipe(recipe: PresenceRecipe): PresenceHostAttrs {
  return { "data-recipe": recipe };
}
