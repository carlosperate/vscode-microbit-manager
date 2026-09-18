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
import { BOARD_VIEW_ID, CONTAINER_ID, OFFERS } from '../src/config';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Keyed by the platform each was built for, spelled as the manifest does: repo-root-relative, leading `./`. */
const written = new Map<string, string>(
	getBuildOptions().map((options: { platform: string; outfile: string }) => [
		options.platform,
		`./${path.relative(root, options.outfile).split(path.sep).join('/')}`,
	])
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

describe('the panel', () => {
	const container = manifest.contributes.viewsContainers.activitybar.find((entry) => entry.id === CONTAINER_ID);
	const views: { id: string; name: string; when?: string }[] = manifest.contributes.views[CONTAINER_ID];

	/** VS Code merges a lone view's name into the container header, and shows it once only when the two match. */
	it('names its one view the same as its container', () => {
		expect(views.map((view) => view.id)).toEqual([BOARD_VIEW_ID]);
		expect(views[0]?.name).toBe(container?.title);
	});

	/** A `when` hides the container until a key is set, so the icon would arrive a moment after the window. */
	it('shows the view unconditionally', () => {
		expect(views[0]?.when).toBeUndefined();
	});

	/** A key the welcome content reads and nothing sets is a link that never shows, with no error anywhere. */
	it('reads only the offer keys the code sets', () => {
		const welcome = manifest.contributes.viewsWelcome.filter((entry) => entry.view === BOARD_VIEW_ID);
		const keys = new Set(welcome.flatMap((entry) => entry.when?.match(/bbcmicrobit-manager\.offer\w+/g) ?? []));
		expect([...keys].sort()).toEqual(OFFERS.map((offer) => offer.context).sort());
	});

	/** Every combination of installed extensions, so a clause that overlaps another shows a link twice. */
	it('links each missing language extension exactly once, and no installed one', () => {
		const offers = manifest.contributes.viewsWelcome.filter(
			(entry) => entry.view === BOARD_VIEW_ID && entry.when?.includes('.offer')
		);
		const link = (extension: string) => `command:extension.open?${encodeURIComponent(JSON.stringify([extension]))}`;
		for (const missing of [[], [0], [1], [0, 1]].map((at) => at.map((index) => OFFERS[index]!))) {
			const keys = new Set<string>(missing.map((offer) => offer.context));
			// The clauses here are `a && !b` only, which is all this evaluates.
			const shown = offers.filter((entry) =>
				(entry.when ?? '').split(' && ').every((term) => (term.startsWith('!') ? !keys.has(term.slice(1)) : keys.has(term)))
			);
			const contents = shown.map((entry) => entry.contents).join('\n');
			for (const { extension } of OFFERS) {
				const expected = missing.some((offer) => offer.extension === extension) ? 1 : 0;
				expect(contents.split(link(extension)).length - 1, `${extension} with ${[...keys].join(', ') || 'nothing'} offered`).toBe(expected);
			}
			expect(shown.length, 'one block, so the sentence shows once').toBe(missing.length ? 1 : 0);
		}
	});
});
