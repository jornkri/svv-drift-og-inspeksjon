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

  // Start inspeksjon fra objektpanelet: skjemaet er autoutfylt fra objektet
  await page.getByRole("button", { name: "Start inspeksjon" }).click();
  const auto = page.locator(".autoboks");
  await expect(auto).toContainText("SR-003 · Stikkrennetrase-003");
  await expect(auto).toContainText("57,21 m");
  await expect(page.getByText("OPG-1042")).toBeVisible();
});

test.describe("felt (mobil)", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("geofence → bunnark → autoutfylt skjema → frakoblet kø → synk", async ({ page }) => {
    await page.goto("/?simgps=1#/kart");
    const ark = page.getByRole("region", { name: "Nærmeste objekt" });
    await expect(ark).toContainText("DU ER VED", { timeout: 60_000 });
    await expect(page.locator(".gpsstatus")).toContainText("Simulert GPS ±3 m");
    const navn = (await ark.locator(".bunnark__navn").textContent())!.trim();

    // Frakoblet modus
    await page.getByRole("link", { name: "Meg" }).click();
    await page.getByLabel("Simuler frakoblet modus (test av køen)").check();
    await page.getByRole("link", { name: "Kart" }).click();
    await expect(page.getByRole("region", { name: "Nærmeste objekt" })).toContainText("DU ER VED", { timeout: 30_000 });

    await page.getByRole("region", { name: "Nærmeste objekt" }).getByRole("button", { name: "Start inspeksjon" }).click();
    await expect(page.locator(".autoboks")).toContainText("Autoutfylt fra nærmeste objekt");
    const objekt = (await page.locator(".autoboks dd").first().textContent())!;
    expect(navn.length).toBeGreaterThan(0);
    expect(objekt).toContain(navn.split(" ").pop()!);

    await page.getByLabel("TG 0 – Ingen").check({ force: true });
    await page.getByLabel(/Avvikstype/).selectOption("Ingen avvik");
    await page.getByLabel("Nei", { exact: true }).check();
    await page.getByRole("button", { name: "Send inn" }).click();
    await expect(page.locator(".toasts")).toContainText("Lagret i kø");
    await expect(page.locator(".gpsstatus")).toContainText("Frakoblet · 1 i kø");

    // På nett igjen: køen sendes automatisk
    await page.getByRole("link", { name: "Meg" }).click();
    await page.getByLabel("Simuler frakoblet modus (test av køen)").uncheck();
    await expect(page.locator(".toasts")).toContainText("er sendt");
    await expect(page.locator(".statusboks")).toContainText("0 inspeksjoner venter");
  });
});
