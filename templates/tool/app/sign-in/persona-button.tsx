"use client";
import { useTransition } from "react";
import { Button } from "@platform/ui";
import { personaSignIn } from "./actions";

export function PersonaButton({ personaKey, label }: { personaKey: string; label: string }) {
  const [pending, start] = useTransition();
  return <Button variant="secondary" className="w-full justify-start" data-testid={`persona-${personaKey}`} disabled={pending} onClick={() => start(() => personaSignIn(personaKey))}>{label}</Button>;
}
