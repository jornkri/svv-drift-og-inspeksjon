import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * Universell utforming: automatisk sjekk med axe (WCAG 2.1 A/AA) av hovedskjermene.
 * Kartflatene (arcgis-map/arcgis-scene) er Esri-komponenter og holdes utenfor.
 */
async function sjekk(page: Page, navn: string) {
  const res = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .exclude("arcgis-map")
    .exclude("arcgis-scene")
    .exclude("arcgis-scale-bar")
    .analyze();
  const alvorlige = res.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  const rapport = alvorlige.map((v) => `${v.id} (${v.impact}): ${v.help}\n  ${v.nodes.map((n) => n.target.join(" ")).slice(0, 5).join("\n  ")}`).join("\n");
  expect(alvorlige, `${navn}:\n${rapport}`).toEqual([]);
}

test("kontor: kart med objektpanel og MMI-boks", async ({ page }) => {
  await page.goto("/?objekt=SR-003#/kart");
  await expect(page.getByRole("heading", { name: "Stikkrennetrase-003" })).toBeVisible({ timeout: 60_000 });
  await sjekk(page, "2D-kart");
  await page.getByRole("button", { name: /MMI:/ }).click();
  await expect(page.getByRole("dialog", { name: "Filtrer på MMI" })).toBeVisible();
  await sjekk(page, "MMI-boks");
});

test("kontor: oppgaver", async ({ page }) => {
  await page.goto("/#/oppgaver");
  await page.getByRole("button", { name: "Kontroll av innløp etter flom" }).click();
  await expect(page.getByRole("complementary", { name: "Valgt oppgave" })).toContainText("OPG-1042");
  await sjekk(page, "Oppgaver");
});

test("kontor: oversikt", async ({ page }) => {
  await page.goto("/#/oversikt");
  await expect(page.getByRole("img", { name: "MMI-fremdrift per fag" })).toBeVisible({ timeout: 60_000 });
  await sjekk(page, "Oversikt");
});

test.describe("felt", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("feltkart og inspeksjonsskjema", async ({ page }) => {
    await page.goto("/?simgps=1#/kart");
    await expect(page.getByRole("region", { name: "Nærmeste objekt" })).toContainText("DU ER VED", { timeout: 60_000 });
    await sjekk(page, "Feltkart");
    await page.getByRole("region", { name: "Nærmeste objekt" }).getByRole("button", { name: "Start inspeksjon" }).click();
    await expect(page.locator(".autoboks")).toBeVisible();
    await sjekk(page, "Inspeksjonsskjema");
  });

  test("trykkflater er minst 44 px", async ({ page }) => {
    await page.goto("/?simgps=1#/kart");
    await expect(page.getByRole("region", { name: "Nærmeste objekt" })).toContainText("DU ER VED", { timeout: 60_000 });
    const sma = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>("svv-app button, svv-app a[href], svv-app input:not(.visually-hidden), svv-app select")]
        .filter((el) => !el.closest("arcgis-map") && el.offsetParent !== null)
        .map((el) => {
          const target = el.closest("label") ?? el;
          const r = target.getBoundingClientRect();
          return { navn: (el.getAttribute("aria-label") ?? el.textContent ?? el.tagName).trim().slice(0, 40), b: Math.round(r.width), h: Math.round(r.height) };
        })
        .filter((x) => x.b < 44 || x.h < 44),
    );
    expect(sma, JSON.stringify(sma, null, 1)).toEqual([]);
  });
});
