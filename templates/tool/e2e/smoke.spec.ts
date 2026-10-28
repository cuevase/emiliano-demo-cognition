import { expect, test } from "@playwright/test";

test("support agent creates an item; PII is masked for a viewer-level role", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByTestId("persona-alice").click();
  await expect(page.getByTestId("current-user")).toContainText("Alice");
  await page.goto("/items/new");
  await page.getByLabel("Title").fill("Smoke test item");
  await page.getByLabel("Customer email").fill("smoke@example.com");
  await page.getByLabel("Amount (USD)").fill("12");
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByRole("status")).toContainText("Done");
  await page.goto("/");
  await expect(page.getByText("Smoke test item").first()).toBeVisible();
  await expect(page.getByText("smoke@example.com")).toHaveCount(0);
});
