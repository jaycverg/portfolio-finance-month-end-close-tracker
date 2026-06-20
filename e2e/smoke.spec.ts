import { test, expect } from "@playwright/test";

test("close dashboard renders seeded data", async ({ page }) => {
  await page.goto("/");

  // Page shell.
  await expect(
    page.getByRole("heading", { name: "Close Dashboard" }),
  ).toBeVisible();

  // Stat cards reflect seeded progress.
  await expect(page.getByText("Progress", { exact: true })).toBeVisible();
  await expect(page.getByText("Days to deadline")).toBeVisible();

  // A seeded close area + task is shown (Bank Recs always has tasks).
  await expect(
    page.getByRole("heading", { name: "Bank Recs" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Reconcile operating account/i }),
  ).toBeVisible();

  // Burndown chart rendered as inline SVG.
  await expect(
    page.getByRole("img", { name: /burndown chart/i }),
  ).toBeVisible();
});

test("task board lists status columns and links to a task detail", async ({
  page,
}) => {
  await page.goto("/board");
  await expect(page.getByRole("heading", { name: "Task Board" })).toBeVisible();

  // Status columns present.
  await expect(page.getByRole("heading", { name: "Done" })).toBeVisible();

  // Navigate into a task detail.
  await page
    .getByRole("link", { name: /Reconcile operating account/i })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Dependencies" }),
  ).toBeVisible();
});
