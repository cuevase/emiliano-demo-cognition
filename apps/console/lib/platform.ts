import { createPlatform, type Platform } from "@platform/actions/core";
import type { ToolManifest, User } from "@platform/permissions";
import { TOOLS, TOOL_PLATFORMS } from "./tools";

/** Console platform: platform roles plus every registered tool's permissions. */
export const platform = createPlatform("console", TOOLS);

/** The platform that owns an approval request's handler. */
/** Tools the user may open (has `<tool>:read`). Drives the home catalog and the nav. */
export const visibleTools = (user: User | null): ToolManifest[] =>
  user ? TOOLS.filter((t) => platform.registry.can(user, `${t.name}:read`)) : [];

export const platformFor = (app: string): Platform => TOOL_PLATFORMS[app] ?? platform;
