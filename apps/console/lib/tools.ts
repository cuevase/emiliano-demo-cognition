import { manifest as refundsManifest } from "@/tools/refunds/manifest";
import { platform as refundsPlatform } from "@/tools/refunds/lib/actions";
import type { Platform } from "@platform/actions/core";
import type { ToolManifest } from "@platform/permissions";

/** Registered tools. `pnpm new-tool` adds entries at the markers. */
export const TOOLS: ToolManifest[] = [
  refundsManifest,
  // new-tool:manifests
];

/** Each tool's platform instance, so the console inbox can execute approved tool actions. */
export const TOOL_PLATFORMS: Record<string, Platform> = {
  "refunds": refundsPlatform,
  // new-tool:platforms
};
