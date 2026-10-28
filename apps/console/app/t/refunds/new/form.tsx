"use client";
import { useState } from "react";
import { z } from "zod";
import { Form, type ActionResultLike } from "@platform/ui/client";
import { REGIONS } from "@/tools/refunds/lib/schema";
import { submitRefund } from "../server-actions";

const schema = z.object({
  customer_name: z.string().trim().min(2),
  customer_email: z.email(),
  order_id: z.string().trim().min(3),
  amount: z.number().positive().max(100_000),
  reason: z.string().trim().min(3),
  region: z.enum(REGIONS),
});

export function NewRefundForm() {
  const [id, setId] = useState<string | null>(null);
  return (
    <div className="space-y-3">
      <Form
        schema={schema}
        submitLabel="Submit refund"
        defaultValues={{ region: "US" }}
        fields={[
          { name: "customer_name", label: "Customer name", hint: "PII: masked for roles without refunds:pii.read and redacted in the audit log." },
          { name: "customer_email", label: "Customer email", type: "email" },
          { name: "order_id", label: "Order ID", placeholder: "ORD-123456" },
          { name: "amount", label: "Amount (USD)", type: "number" },
          { name: "reason", label: "Reason", type: "textarea" },
          { name: "region", label: "Region", type: "select", options: REGIONS.map((r) => ({ value: r, label: r })) },
        ]}
        action={async ({ amount, ...v }) => {
          const r = await submitRefund({ ...v, amount_cents: Math.round(amount * 100) });
          setId(r.ok && "id" in r ? r.id : null);
          return r as ActionResultLike;
        }}
      />
      {id ? <a className="text-sm underline" href={`/t/refunds/${id}`}>View refund →</a> : null}
    </div>
  );
}
