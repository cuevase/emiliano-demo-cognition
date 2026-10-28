import { createPlatform } from "@platform/actions/core";
import { manifest } from "../manifest";

export const platform = createPlatform("__TOOL__", [manifest]);
