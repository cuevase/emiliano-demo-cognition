"use client";
import { useState, useTransition, type ReactNode } from "react";
import { useForm, type DefaultValues, type FieldValues, type Path } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Button, Input, Label, Select, Textarea } from "./primitives";

export type ActionResultLike =
  | { ok: true; data?: unknown; pending?: boolean; message?: string }
  | { ok: false; error: string; issues?: Record<string, string[]> };

export interface FieldSpec<T> {
  name: Path<T>;
  label: string;
  type?: "text" | "number" | "email" | "textarea" | "select";
  options?: { value: string; label: string }[];
  placeholder?: string;
  hint?: ReactNode;
}

/** Schema-driven form: client-side Zod validation, then the server action re-validates. */
export function Form<S extends z.ZodType<FieldValues, FieldValues>>({ schema, fields, action, submitLabel = "Submit", defaultValues, onDone }: {
  schema: S;
  fields: FieldSpec<z.infer<S>>[];
  action: (input: z.infer<S>) => Promise<ActionResultLike>;
  submitLabel?: string;
  defaultValues?: DefaultValues<z.infer<S>>;
  onDone?: (r: ActionResultLike) => void;
}) {
  const form = useForm<z.infer<S>>({ resolver: zodResolver(schema as never) as never, defaultValues });
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResultLike | null>(null);
  const submit = form.handleSubmit((values) =>
    start(async () => {
      const r = await action(values);
      setResult(r);
      if (r.ok) form.reset(defaultValues);
      onDone?.(r);
    }),
  );
  return (
    <form onSubmit={submit} className="space-y-4">
      {fields.map((f) => {
        const err = form.formState.errors[f.name]?.message as string | undefined;
        const reg = form.register(f.name, { valueAsNumber: f.type === "number" });
        return (
          <div key={f.name}>
            <Label htmlFor={f.name}>{f.label}</Label>
            {f.type === "textarea" ? <Textarea id={f.name} placeholder={f.placeholder} {...reg} /> :
             f.type === "select" ? <Select id={f.name} {...reg}>{f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select> :
             <Input id={f.name} type={f.type ?? "text"} step={f.type === "number" ? "any" : undefined} placeholder={f.placeholder} {...reg} />}
            {f.hint ? <p className="mt-1 text-xs text-slate-500">{f.hint}</p> : null}
            {err ? <p className="mt-1 text-xs text-red-600">{err}</p> : null}
          </div>
        );
      })}
      <Button type="submit" disabled={pending}>{pending ? "Working…" : submitLabel}</Button>
      {result ? <ResultMessage result={result} /> : null}
    </form>
  );
}

export function ResultMessage({ result }: { result: ActionResultLike }) {
  if (!result.ok) return <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{result.error}</p>;
  if (result.pending) return <p role="status" className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">{result.message ?? "Sent for approval"}</p>;
  return <p role="status" className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Done</p>;
}

/** A single-button server action with optional comment, e.g. Approve / Reject. */
export function ActionButton({ action, label, variant = "primary", confirm }: {
  action: () => Promise<ActionResultLike>;
  label: string;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  confirm?: string;
}) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResultLike | null>(null);
  return (
    <div className="inline-flex flex-col gap-2">
      <Button variant={variant} disabled={pending} onClick={() => {
        if (confirm && !window.confirm(confirm)) return;
        start(async () => setResult(await action()));
      }}>{pending ? "Working…" : label}</Button>
      {result && !result.ok ? <ResultMessage result={result} /> : null}
    </div>
  );
}
