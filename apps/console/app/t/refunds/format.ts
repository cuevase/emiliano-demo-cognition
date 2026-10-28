export const usd = (cents: number) => (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
export const statusLabel = (s: string) => s.replace("_", " ");
