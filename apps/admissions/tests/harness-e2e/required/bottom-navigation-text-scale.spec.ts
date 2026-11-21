/**
 * Required harness check: the bottom navigation keeps every item on screen, with its
 * whole label, when the text is enlarged (platform-simplification task 22.5,
 * Requirement 21.2, Requirement 21 / task 31.1's whole labels).
 *
 * The rendered design gate measures the bar at 390 x 844 with the default text size
 * only. The first fix for its clipped labels made the row a grid of
 * `minmax(min-content, 1fr)` columns, which held at the default size and pushed items
 * past the right edge once the text was enlarged: with the root font at 150% the
 * student's row measured 479 px on a 360 px screen and the tenant admin's 414 px, and
 * at 200% Logout and More started beyond the edge (W2 review, finding W2-R1-1). The
 * bar now wraps onto another row instead, and the page reserves the taller bar.
 *
 * Text is enlarged the way the repo's other R16.8 checks do it: the root element's
 * font size is set before first paint (`a11y-zoom-dimensions.spec.ts`, Dimension 6).
 * At each width and size, for the student and for a tenant admin, this asserts:
 *
 * 1. every item ends inside the viewport (left, right, top and bottom);
 * 2. every item is at least 44 x 44 px and no two items overlap;
 * 3. every label is whole, inside its own item, and the item's accessible name
 *    contains it (WCAG 2.5.3);
 * 4. at the default size the bar is still one row, as before;
 * 5. scrolled to the end, the page's last content ends above the bar, so nothing
 *    is left underneath a taller bar.
 *
 * The measurements are attached to each test as JSON. Runs with the strict harness
 * gates (`harness-fixtures.ts`) in both required projects.
 */
import { test, expect, type Page } from '../harness-fixtures';
import {
  allowHarnessNoise,
  buildStudentWorld,
  loginStudent,
  settled,
  type StudentWorld,
} from '../helpers/surfaces-13-3';
import { createScopedTenantAdmin } from '../helpers/two-tenant';

const BOTTOM_NAV = 'nav[aria-label="Bottom navigation"]';

const WIDTHS = [
  { width: 360, height: 800 },
  { width: 390, height: 844 },
] as const;

/** 100% is the control: the bar must still be the one row it was. */
const TEXT_SIZES = [
  { label: '100', rootPx: 16 },
  { label: '150', rootPx: 24 },
  { label: '200', rootPx: 32 },
] as const;

interface Role {
  id: 'student' | 'tenantAdmin';
  url: string;
  /** Labels that must be on the bar: the longest one of each role is among them. */
  expectedLabels: string[];
  ready: (page: Page) => Promise<void>;
}

const ROLES: Role[] = [
  {
    id: 'student',
    url: '/student/dashboard',
    expectedLabels: ['My application', 'Messages', 'Account', 'Logout'],
    ready: async (page) => {
      await expect(page.getByTestId('student-next-action')).toBeVisible({ timeout: 45_000 });
    },
  },
  {
    id: 'tenantAdmin',
    url: '/admin/applications',
    expectedLabels: ['My school', 'More'],
    ready: async (page) => {
      await expect(page.locator('main').first()).toBeVisible({ timeout: 45_000 });
    },
  },
];

interface ItemBox {
  name: string;
  label: string;
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
  labelLeft: number | null;
  labelRight: number | null;
}

interface NavMeasurement {
  rootFontSize: string;
  viewport: { width: number; height: number };
  items: ItemBox[];
  rows: number;
  navTop: number;
  navHeight: number;
  measuredHeightProperty: string;
  bottomOffsetProperty: string;
}

interface ReachMeasurement {
  scrolledTo: number;
  navTop: number;
  lowestContentBottom: number;
  lowestContent: string;
}

let world: StudentWorld | undefined;
let tenantAdmin: { email: string; password: string } | undefined;

test.beforeAll(async () => {
  world = await buildStudentWorld('navtext');
  tenantAdmin = await createScopedTenantAdmin(world.admin, world.institutionId, 'navtext');
});

test.afterAll(async () => {
  if (world) {
    await world.admin.ctx.dispose();
    world = undefined;
  }
});

async function signIn(page: Page, role: Role): Promise<void> {
  if (role.id === 'student') {
    await loginStudent(page, world!);
    return;
  }
  const login = await page.request.post('/api/v1/auth/login/', { data: tenantAdmin! });
  expect(login.ok(), `${tenantAdmin!.email} should log in (got ${login.status()})`).toBeTruthy();
}

async function measureNav(page: Page): Promise<NavMeasurement> {
  return page.evaluate((selector) => {
    const nav = document.querySelector<HTMLElement>(selector);
    if (!nav) throw new Error(`${selector} is not on the page`);
    const row = nav.lastElementChild as HTMLElement;
    const items: ItemBox[] = Array.from(row.children).map((child) => {
      const el = child as HTMLElement;
      const r = el.getBoundingClientRect();
      const span = el.querySelector<HTMLElement>('span[aria-hidden="true"]:not([data-text-role])');
      let labelLeft: number | null = null;
      let labelRight: number | null = null;
      if (span) {
        const range = document.createRange();
        range.selectNodeContents(span);
        const t = range.getBoundingClientRect();
        labelLeft = t.left;
        labelRight = t.right;
      }
      return {
        name: el.getAttribute('aria-label') ?? '',
        label: (span?.textContent ?? '').trim(),
        left: r.left,
        right: r.right,
        top: r.top,
        bottom: r.bottom,
        width: r.width,
        height: r.height,
        labelLeft,
        labelRight,
      };
    });
    const tops = new Set(items.map((item) => Math.round(item.top)));
    const root = document.documentElement;
    const navRect = nav.getBoundingClientRect();
    return {
      rootFontSize: getComputedStyle(root).fontSize,
      viewport: { width: root.clientWidth, height: window.innerHeight },
      items,
      rows: tops.size,
      navTop: navRect.top,
      navHeight: navRect.height,
      measuredHeightProperty: root.style.getPropertyValue('--bottom-nav-measured-height'),
      bottomOffsetProperty: getComputedStyle(root).getPropertyValue('--bottom-nav-safe-offset').trim(),
    };
  }, BOTTOM_NAV);
}

/**
 * Scroll to the end and find the lowest piece of content a student reads or uses
 * inside `main`: an element with its own text, or a control. Fixed and sticky
 * surfaces are skipped, and so are wrappers, whose boxes include the padding that
 * reserves the bar. Content clipped by an inner scroller counts only down to that
 * scroller's edge.
 */
async function measureReach(page: Page): Promise<ReachMeasurement> {
  return page.evaluate(async (selector) => {
    // `html` scrolls smoothly (`index.css`); jump instead, then let two frames land.
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' as ScrollBehavior });
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(null))));
    const nav = document.querySelector<HTMLElement>(selector)!;
    const main = document.querySelector('main')!;
    /** The element's visible bottom, or null when a fixed or sticky ancestor carries it. */
    const visibleBottom = (el: Element, bottom: number): number | null => {
      let clamped = bottom;
      for (let node: Element | null = el; node && node !== main; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (style.position === 'fixed' || style.position === 'sticky') return null;
        if (node !== el && style.overflowY !== 'visible') {
          clamped = Math.min(clamped, node.getBoundingClientRect().bottom);
        }
      }
      return clamped;
    };
    let lowestContentBottom = Number.NEGATIVE_INFINITY;
    let lowestContent = '';
    for (const el of Array.from(main.querySelectorAll<HTMLElement>('*'))) {
      const ownText = Array.from(el.childNodes).some(
        (node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim() !== '',
      );
      const control = el.matches('a[href], button, input, select, textarea, [role="button"]');
      if (!ownText && !control) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 1 || rect.height <= 1) continue;
      const style = getComputedStyle(el);
      if (style.visibility === 'hidden' || style.display === 'none' || style.opacity === '0') continue;
      const bottom = visibleBottom(el, rect.bottom);
      if (bottom === null || bottom <= rect.top) continue;
      if (bottom > lowestContentBottom) {
        lowestContentBottom = bottom;
        lowestContent = `${el.tagName.toLowerCase()} "${(el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 60)}"`;
      }
    }
    return {
      scrolledTo: window.scrollY,
      navTop: nav.getBoundingClientRect().top,
      lowestContentBottom,
      lowestContent,
    };
  }, BOTTOM_NAV);
}

function overlap(a: ItemBox, b: ItemBox): number {
  const x = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return x > 0 && y > 0 ? x * y : 0;
}

for (const role of ROLES) {
  for (const viewport of WIDTHS) {
    for (const size of TEXT_SIZES) {
      test(`${role.id}: every bottom-navigation item is on screen with its whole label at ${size.label}% text, ${viewport.width}x${viewport.height}`, async ({
        page,
        gate,
      }, testInfo) => {
        allowHarnessNoise(gate);
        await signIn(page, role);
        await page.setViewportSize(viewport);
        // Before first paint, and again once the document exists (a11y-zoom-dimensions
        // measured the one-liner throwing before `documentElement` is there).
        await page.addInitScript((px) => {
          const apply = () => {
            document.documentElement?.style.setProperty('font-size', `${px}px`);
          };
          apply();
          document.addEventListener('DOMContentLoaded', apply, { once: true });
        }, size.rootPx);

        await page.goto(role.url, { waitUntil: 'domcontentloaded' });
        await settled(page);
        await role.ready(page);
        await expect(page.locator(BOTTOM_NAV)).toBeVisible({ timeout: 30_000 });
        // Let the bar's ResizeObserver publish after the last layout change.
        await page.waitForTimeout(400);

        const nav = await measureNav(page);
        const reach = await measureReach(page);
        await testInfo.attach(`bottom-nav-${role.id}-${viewport.width}-${size.label}.json`, {
          body: JSON.stringify({ role: role.id, size: size.label, nav, reach }, null, 2),
          contentType: 'application/json',
        });
        console.log(
          `[nav-text-scale] ${testInfo.project.name} ${role.id} ${viewport.width}px ${size.label}%: ` +
            `rows=${nav.rows} navHeight=${nav.navHeight.toFixed(1)} ` +
            `maxRight=${Math.max(...nav.items.map((i) => i.right)).toFixed(1)} ` +
            `measured=${nav.measuredHeightProperty || '(none)'} offset=${nav.bottomOffsetProperty} ` +
            `lowestContentBottom=${reach.lowestContentBottom.toFixed(1)} navTop=${reach.navTop.toFixed(1)}`,
        );

        expect(nav.rootFontSize, 'the enlarged root font is applied').toBe(`${size.rootPx}px`);
        const labels = nav.items.map((item) => item.label);
        for (const expected of role.expectedLabels) {
          expect(labels, `the ${role.id} bar shows "${expected}"`).toContain(expected);
        }

        const { width: vw, height: vh } = nav.viewport;
        for (const item of nav.items) {
          const where = `"${item.label}" [${item.left.toFixed(1)}, ${item.right.toFixed(1)}] x [${item.top.toFixed(1)}, ${item.bottom.toFixed(1)}] in ${vw}x${vh}`;
          expect(item.left, `${where} starts inside the viewport`).toBeGreaterThanOrEqual(-0.5);
          expect(item.right, `${where} ends inside the viewport`).toBeLessThanOrEqual(vw + 0.5);
          expect(item.top, `${where} is below the top of the viewport`).toBeGreaterThanOrEqual(-0.5);
          expect(item.bottom, `${where} ends above the bottom of the viewport`).toBeLessThanOrEqual(vh + 0.5);
          expect(item.width, `${where} is at least 44 px wide`).toBeGreaterThanOrEqual(43.5);
          expect(item.height, `${where} is at least 44 px tall`).toBeGreaterThanOrEqual(43.5);
          expect(item.label.length, `${where} shows its label`).toBeGreaterThan(0);
          expect(item.name.toLowerCase(), `${where}: the accessible name contains the visible label`).toContain(
            item.label.toLowerCase(),
          );
          expect(item.labelLeft!, `${where}: the label starts inside its item`).toBeGreaterThanOrEqual(item.left - 0.5);
          expect(item.labelRight!, `${where}: the label ends inside its item`).toBeLessThanOrEqual(item.right + 0.5);
        }
        nav.items.forEach((a, i) => {
          for (const b of nav.items.slice(i + 1)) {
            expect(overlap(a, b), `"${a.label}" and "${b.label}" do not overlap`).toBeLessThanOrEqual(0.5);
          }
        });
        if (size.rootPx === 16) {
          expect(nav.rows, 'at the default text size the bar is one row').toBe(1);
        }

        expect(
          reach.lowestContentBottom,
          `scrolled to the end, the page's last content (${reach.lowestContent}) ends above the bar's top edge`,
        ).toBeLessThanOrEqual(reach.navTop + 0.5);
      });
    }
  }
}
