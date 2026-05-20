import { test, expect } from "@playwright/test";

test("admin login fails with wrong password", async ({ page }) => {
  await page.goto("/admin.html");
  await page.fill("#password", "wrong");
  await page.click("#login-btn");
  await expect(page.locator("#login-error")).toBeVisible();
});
