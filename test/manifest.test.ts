/**
 * The manifest and the build agree on which bundle each host loads. VS Code
 * reads `main` and `browser` and esbuild writes `outfile`, in two files nothing
 * links together, so a rename there is an extension that activates to nothing
 * and a swap is the node bundle loaded in a Web Worker.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// @ts-expect-error -- plain .mjs config, no types
import { getBuildOptions } from '../config/esbuild.config.mjs';
import manifest from '../package.json';
import {
	ACTIVE_MODE_CONTEXT,
	BOARD_PANEL_MODES_CONTEXT,
	FALLBACK_VIEW_ID,
	MANY_MODES_CONTEXT,
	NO_MODES_CONTEXT,
	SWITCHER_VIEW_ID,
} from '../src/config';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

interface Built {
	platform: string;
	format: string;
	outfile: string;
}

/**
 * The host entry points, keyed by the platform each was built for and spelled
 * as the manifest does: repo-root-relative, leading `./`. Only the CJS bundles:
 * the webview's script is a document's, and no manifest field names it.
 */
const written = new Map<string, string>(
	(getBuildOptions() as Built[])
		.filter((options) => options.format === 'cjs')
		.map((options) => [options.platform, `./${path.relative(root, options.outfile).split(path.sep).join('/')}`])
);

describe('manifest entry points', () => {
	it('sends each host to the bundle built for it', () => {
		expect(manifest.browser).toBe(written.get('browser'));
		expect(manifest.main).toBe(written.get('node'));
	});

	// Not covered by the above: a build writing one outfile for both platforms
	// would satisfy it with `main` and `browser` equal.
	it('gives the two hosts different bundles', () => {
		expect(manifest.main).not.toBe(manifest.browser);
	});
});

describe('the three shapes of the panel', () => {
	const views: { id: string; name: string; type?: string; when?: string; visibility?: string }[] =
		manifest.contributes.views.bbcmicrobit;
	const view = (id: string) => views.find((entry) => entry.id === id);

	/** Set from one place in the code, so the container is never empty and never shows two shapes. */
	it('gates the fallback panel and the switcher on the keys the registry sets', () => {
		expect(view(FALLBACK_VIEW_ID)?.when).toBe(
			`${NO_MODES_CONTEXT} || ${ACTIVE_MODE_CONTEXT} in ${BOARD_PANEL_MODES_CONTEXT}`
		);
		expect(view(SWITCHER_VIEW_ID)?.when).toBe(MANY_MODES_CONTEXT);
	});

	/** A webview, since a segmented control is what reads as a toggle; no `visibility`, so every host opens it the same way. */
	it('draws the switcher as a webview that starts expanded', () => {
		expect(view(SWITCHER_VIEW_ID)?.type).toBe('webview');
		expect(view(SWITCHER_VIEW_ID)?.visibility).toBeUndefined();
	});

	/** The owner's `order` is honoured and every other extension's views sort after, so the strip is on top by default. */
	it('puts the switcher before anything else this extension contributes', () => {
		expect(views[0]?.id).toBe(SWITCHER_VIEW_ID);
	});
});
