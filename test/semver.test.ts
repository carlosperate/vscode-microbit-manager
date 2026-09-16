import { describe, expect, it } from 'vitest';

import { compareSemver, parseSemver, serves, whoIsBehind, type Semver } from '../src/modes/semver';

const v = (text: string): Semver => {
	const parsed = parseSemver(text);
	if (!parsed) throw new Error(`test gave a bad version: ${text}`);
	return parsed;
};

describe('parsing a version', () => {
	it('reads major, minor and patch', () => {
		expect(parseSemver('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3 });
		expect(parseSemver('0.1.0')).toEqual({ major: 0, minor: 1, patch: 0 });
	});

	it('refuses anything that is not three numbers', () => {
		for (const bad of ['1.2', '1.2.3.4', 'v1.2.3', '1.2.3-beta', '01.2.3', '', 1, undefined, null, {}]) {
			expect(parseSemver(bad), String(bad)).toBeUndefined();
		}
	});
});

describe('comparing versions', () => {
	it('orders by major, then minor, then patch', () => {
		expect(compareSemver(v('1.0.0'), v('0.9.9'))).toBeGreaterThan(0);
		expect(compareSemver(v('1.2.0'), v('1.10.0'))).toBeLessThan(0);
		expect(compareSemver(v('1.2.3'), v('1.2.3'))).toBe(0);
	});
});

describe('serving a mode', () => {
	/** The pairing every user has: the gallery updates the dependency first. */
	it('accepts an older mode against a newer manager of the same major', () => {
		expect(serves(v('1.4.0'), v('1.2.0'))).toBe(true);
		expect(serves(v('1.2.0'), v('1.2.0'))).toBe(true);
	});

	it('refuses a mode needing more than the manager has', () => {
		expect(serves(v('1.2.0'), v('1.3.0'))).toBe(false);
		expect(serves(v('1.2.0'), v('1.2.1'))).toBe(false);
	});

	it('refuses across a major in either direction', () => {
		expect(serves(v('2.0.0'), v('1.9.0'))).toBe(false);
		expect(serves(v('1.9.0'), v('2.0.0'))).toBe(false);
	});

	/** Additions raise the minor, so a zero major is not treated as unstable here. */
	it('treats a zero major like any other', () => {
		expect(serves(v('0.2.0'), v('0.1.0'))).toBe(true);
		expect(serves(v('0.1.0'), v('0.2.0'))).toBe(false);
	});
});

describe('who to update', () => {
	it('names the manager when the mode wants more than it has', () => {
		expect(whoIsBehind(v('1.2.0'), v('1.3.0'))).toBe('manager');
		expect(whoIsBehind(v('1.2.0'), v('2.0.0'))).toBe('manager');
	});

	it('names the mode when it was built for an older major', () => {
		expect(whoIsBehind(v('2.0.0'), v('1.9.0'))).toBe('mode');
	});
});
