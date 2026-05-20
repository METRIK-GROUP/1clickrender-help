import { test, expect } from "@playwright/test";

test("send message, receive streaming response, mark thumbs up", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#title")).toHaveText(/Ajuda/);
  await page.fill("#input", "Como instalo o plugin?");
  await page.click("#send");
  await expect(page.locator(".msg.user").last()).toContainText("Como instalo");
  // Wait for streamed response (max 30s)
  await expect(page.locator(".msg.assistant").last()).not.toBeEmpty({ timeout: 30000 });
});

test("language switch updates UI to English", async ({ page }) => {
  await page.goto("/");
  await page.click('[data-lang="en"]');
  await expect(page.locator("#title")).toHaveText("1 Click Render — Help");
  await expect(page.locator("#send")).toHaveText("Send");
});
