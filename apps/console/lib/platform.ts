import { createPlatform, type Platform } from "@platform/actions/core";
import { TOOLS, TOOL_PLATFORMS } from "./tools";

/** Console platform: platform roles plus every registered tool's permissions. */
export const platform = createPlatform("console", TOOLS);

/** The platform that owns an approval request's handler. */
export const platformFor = (app: string): Platform => TOOL_PLATFORMS[app] ?? platform;
