"use client";
import { z } from "zod";
import { Form } from "@platform/ui/client";
import { createItem } from "../../server-actions";

const schema = z.object({ title: z.string().min(3), customer_email: z.email(), amount: z.number().min(0) });

export function NewItemForm() {
  return (
    <Form
      schema={schema}
      submitLabel="Create"
      fields={[
        { name: "title", label: "Title" },
        { name: "customer_email", label: "Customer email", type: "email", hint: "Classified as PII: masked for roles without __TOOL__:pii.read and redacted in the audit log." },
        { name: "amount", label: "Amount (USD)", type: "number" },
      ]}
      action={async (v) => createItem({ title: v.title, customer_email: v.customer_email, amount_cents: Math.round(v.amount * 100) })}
    />
  );
}
