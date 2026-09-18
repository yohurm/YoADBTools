/**
 * 浏览路径安全根。规则在 @yohu/api（镜像 yohu-domain::SafetyRoot）。
 * core 仍强制校验，不信任本层。
 */

export {
  checkDescendant,
  guardBrowsePath,
  isStrictlyUnderSafety,
  isWithinSafety,
  parseSafetyPath,
  type PathGuardError,
} from "@yohu/api";
