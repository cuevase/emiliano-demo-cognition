import type { Platform } from "@platform/actions/core";
import type { ToolManifest } from "@platform/permissions";

/** Registered tools. `pnpm new-tool` adds entries at the markers. */
export const TOOLS: ToolManifest[] = [
  // new-tool:manifests
];

/** Each tool's platform instance, so the console inbox can execute approved tool actions. */
export const TOOL_PLATFORMS: Record<string, Platform> = {
  // new-tool:platforms
};
