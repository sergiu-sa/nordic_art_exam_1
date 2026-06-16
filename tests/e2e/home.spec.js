import { test, expect } from "@playwright/test";

test("home page loads with its heading and no console errors", async ({ page }) => {
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await page.goto("/");

  await expect(page.locator("main#main h1")).toHaveText("Nordic Art Archive");
  expect(errors).toEqual([]);
});
