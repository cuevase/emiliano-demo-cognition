import { createPlatform } from "@platform/actions";

/** The console has no tool manifest of its own; it uses the platform roles and permissions. */
export const platform = createPlatform("console");
