import { chromium } from 'playwright';
import fs from 'fs';

const BASE = 'http://localhost:3000';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  // Login
  await page.goto(`${BASE}/login/`);
  await page.fill('input[name="username"]', 'admin');
  await page.fill('input[name="password"]', 'admin');
  await page.click('input[type="submit"]');
  await page.waitForLoadState('networkidle');

  // Go to editor
  await page.goto(`${BASE}/wiki/Home/edit`);
  await page.waitForSelector('.bn-editor', { timeout: 15000 });
  await page.waitForTimeout(1500);

  // Click the editor to focus and type
  await page.click('.bn-editor');
  await page.keyboard.type('This is a sample paragraph for testing the editor menus.', { delay: 5 });
  await page.waitForTimeout(300);

  // Select all text
  await page.keyboard.down('Control');
  await page.keyboard.press('a');
  await page.keyboard.up('Control');
  await page.waitForTimeout(500);

  // Wait for formatting toolbar
  await page.waitForSelector('.bn-formatting-toolbar', { timeout: 5000 });
  await page.screenshot({ path: '/tmp/editor-selection.png', fullPage: true });

  // Click the Paragraph / block type select button (first button in formatting toolbar)
  const paragraphBtn = page.locator('.bn-formatting-toolbar button').first();
  await paragraphBtn.click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: '/tmp/editor-blocktype-open.png', fullPage: true });

  // Save dropdown HTML and bounding box
  const dropdown = page.locator('.mantine-Menu-dropdown').first();
  if (await dropdown.isVisible().catch(() => false)) {
    const box = await dropdown.boundingBox();
    const outer = await dropdown.evaluate(el => el.outerHTML);
    fs.writeFileSync('/tmp/editor-blocktype-dropdown.html', outer);
    console.log('BlockType dropdown box:', box);
  } else {
    console.log('BlockType dropdown not visible');
  }

  // Close dropdown
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // Find and click Create Link button (icon button, tooltip likely "Link")
  // Try to locate by title/tooltip text. The toolbar buttons are icon only.
  const allButtons = page.locator('.bn-formatting-toolbar button');
  const count = await allButtons.count();
  let linkBtnIndex = -1;
  for (let i = 0; i < count; i++) {
    const text = await allButtons.nth(i).getAttribute('aria-label') || await allButtons.nth(i).textContent();
    console.log('Toolbar button', i, text);
    if (text && /link/i.test(text)) {
      linkBtnIndex = i;
      break;
    }
  }
  if (linkBtnIndex >= 0) {
    await allButtons.nth(linkBtnIndex).click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: '/tmp/editor-link-open.png', fullPage: true });
    const popover = page.locator('.mantine-Popover-dropdown').first();
    if (await popover.isVisible().catch(() => false)) {
      const box = await popover.boundingBox();
      const outer = await popover.evaluate(el => el.outerHTML);
      fs.writeFileSync('/tmp/editor-link-popover.html', outer);
      console.log('Link popover box:', box);
    }
  } else {
    console.log('Link button not found');
  }

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
