import "server-only";
import type { z } from "zod";
import { getCurrentUser, getRequestMeta } from "@platform/auth";
import type { ActionResult, RunnableAction } from "./core";

/** Binds an action to the signed-in user, for use in "use server" files. */
export function serverAction<S extends z.ZodType, R>(action: RunnableAction<S, R>) {
  return async (raw: unknown): Promise<ActionResult<R>> => action(await getCurrentUser(), raw, await getRequestMeta());
}
