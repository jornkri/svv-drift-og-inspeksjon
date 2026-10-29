import { expect, test } from "@playwright/test";

/**
 * Røyktest av hovedflyten i mock-modus:
 * dyplenke → objektpanel → MMI-filter → teller oppdateres.
 */
test("hovedflyt: objekt, MMI-filter og telling", async ({ page }) => {
  await page.goto("/?objekt=SR-003#/kart");

  // Objektpanelet åpnes fra dyplenken
  await expect(page.getByRole("heading", { name: "Stikkrennetrase-003" })).toBeVisible({ timeout: 60_000 });
  await expect(page.locator(".nokkeltall")).toContainText("57,21 m");
  await expect(page.locator(".nokkeltall")).toContainText("105,80–107,99");
  await expect(page.locator(".merke--mmi")).toContainText("MMI 400 · Utførelse");

  // Standardfilteret (Detaljert, Utførelse, Som bygget, I drift)
  const antall = page.getByTestId("antall");
  await expect(antall).toHaveText(/300 av 312/);
  await expect(page.getByRole("button", { name: /MMI: 325–600/ })).toBeVisible();

  // Snarvei i MMI-boksen
  await page.getByRole("button", { name: /MMI:/ }).click();
  await page.getByRole("button", { name: "Som bygget / i drift" }).click();
  await expect(antall).toHaveText(/46 av 312/);
  await page.getByRole("button", { name: "Ferdig" }).click();
  await expect(page.getByRole("button", { name: /MMI: 500–600/ })).toBeVisible();

  // Fagfilter kombineres med MMI-filteret
  await page.getByRole("button", { name: /Fag:/ }).click();
  await page.getByRole("radio", { name: /^VA/ }).click();
  await expect(page.getByRole("button", { name: /Fag: VA/ })).toBeVisible();
  await expect(antall).not.toHaveText(/46 av 312/);

  // Nullstill
  await page.getByRole("button", { name: "Nullstill" }).click();
  await expect(antall).toHaveText(/300 av 312/);

  // Dokumenter-fanen
  await page.getByRole("tab", { name: /Dokumenter/ }).click();
  await expect(page.getByRole("link", { name: /G301/ })).toBeVisible();
});
