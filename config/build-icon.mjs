import { chromium } from 'playwright';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const assetsPath = path.join(here, '..', 'assets');
const svgPath = path.join(assetsPath, 'icon.svg');
const pngPath = path.join(assetsPath, 'icon.png');
const SIZE = 256;

// Reuse Chromium supplied by @vscode/test-web to keep SVG rendering consistent.
async function main() {
	const svg = readFileSync(svgPath, 'utf8');
	const browser = await chromium.launch();
	try {
		const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE } });
		await page.setContent(`<!doctype html><html><body style="margin:0">${svg}</body></html>`);
		await page.locator('svg').evaluate((element, size) => {
			element.setAttribute('width', String(size));
			element.setAttribute('height', String(size));
		}, SIZE);
		await page.locator('svg').screenshot({ path: pngPath, omitBackground: true });
	} finally {
		await browser.close();
	}

	if (statSync(pngPath).size === 0) {
		throw new Error(`${pngPath} was written empty`);
	}
	console.log(`Wrote ${path.relative(process.cwd(), pngPath)} (${SIZE}x${SIZE})`);
}

await main();
