import { describe, expect, it } from 'vitest';

import { nudgeFor, pickMode, shapeOf, worthRemembering, type Pick, type Situation } from '../src/modes/policy';

const situation = (over: Partial<Situation> = {}): Situation => ({
	registered: ['cpp', 'micropython'],
	chosen: undefined,
	claimants: [],
	lastUsed: undefined,
	...over,
});

const picked = (over: Partial<Situation> = {}) => pickMode(situation(over))?.id;

describe('the shape of the panel', () => {
	it('is decided by how many modes are registered', () => {
		expect(shapeOf(0)).toBe('none');
		expect(shapeOf(1)).toBe('one');
		expect(shapeOf(2)).toBe('many');
		expect(shapeOf(3)).toBe('many');
	});
});

describe('picking the active mode', () => {
	it('is nothing when nothing is registered, whatever was stored', () => {
		expect(pickMode(situation({ registered: [], chosen: 'cpp', lastUsed: 'cpp', claimants: ['cpp'] }))).toBeUndefined();
	});

	/** Opening a file, or a claim changing, must never move the panel under the user. */
	it('keeps the mode the user chose over every claim', () => {
		expect(pickMode(situation({ chosen: 'micropython', claimants: ['cpp'], lastUsed: 'cpp' }))).toEqual({
			id: 'micropython',
			because: 'chosen',
		});
	});

	it('seeds from a single claimant before the user has chosen', () => {
		expect(pickMode(situation({ claimants: ['cpp'], lastUsed: 'micropython' }))).toEqual({ id: 'cpp', because: 'claim' });
	});

	it('ignores a claimant that is not registered', () => {
		expect(picked({ claimants: ['ide', 'cpp'] })).toBe('cpp');
	});

	it('falls back to the last used when none or several claim', () => {
		expect(pickMode(situation({ lastUsed: 'micropython' }))).toEqual({ id: 'micropython', because: 'last-used' });
		expect(picked({ claimants: ['cpp', 'micropython'], lastUsed: 'micropython' })).toBe('micropython');
	});

	/**
	 * Registration order is activation order, which differs between a cold start
	 * and a reload; the lowest id is arbitrary but the same everywhere.
	 */
	it('falls back to the lowest id by code unit, never to registration order', () => {
		expect(pickMode(situation({ registered: ['micropython', 'cpp'] }))).toEqual({ id: 'cpp', because: 'lowest-id' });
		expect(picked({ registered: ['zz', 'Zz', 'a'] })).toBe('Zz');
	});

	/** Its stored value is kept, so reinstalling the extension returns the user to it. */
	it('falls back when the chosen mode is not registered, and picks it again once it is', () => {
		expect(picked({ registered: ['micropython'], chosen: 'cpp', lastUsed: 'micropython' })).toBe('micropython');
		expect(picked({ chosen: 'cpp', lastUsed: 'micropython' })).toBe('cpp');
	});

	it('falls back through a last used mode that has gone', () => {
		expect(picked({ registered: ['micropython'], lastUsed: 'cpp' })).toBe('micropython');
	});
});

describe('what becomes the last used mode', () => {
	const pick = (because: Pick['because']): Pick => ({ id: 'cpp', because });

	it('is a mode the user chose or a workspace claimed', () => {
		expect(worthRemembering(pick('chosen'))).toBe(true);
		expect(worthRemembering(pick('claim'))).toBe(true);
	});

	/**
	 * The first mode to register is briefly the only one and so the lowest id.
	 * Remembering it would hand it the panel over a lower id registering a moment
	 * later, and a cold start would then depend on activation order.
	 */
	it('is never a mode that was active only because nothing else was there', () => {
		expect(worthRemembering(pick('lowest-id'))).toBe(false);
		expect(worthRemembering(pick('last-used'))).toBe(false);
	});

	/**
	 * Two modes both claiming a workspace answer in whichever order their reads
	 * finish. The first to answer is briefly the lone claimant; remembering it
	 * would decide the tie by promise order rather than by the rule.
	 */
	it('waits for every claim to answer before a claim counts, but not for a choice', () => {
		expect(worthRemembering(pick('claim'), true)).toBe(false);
		expect(worthRemembering(pick('claim'), false)).toBe(true);
		expect(worthRemembering(pick('chosen'), true)).toBe(true);
	});
});

describe('the nudge', () => {
	it('names the one claimant when another mode is active', () => {
		expect(nudgeFor(['cpp', 'micropython'], 'micropython', ['cpp'])).toBe('cpp');
	});

	it('stays away when the claimant is already active', () => {
		expect(nudgeFor(['cpp', 'micropython'], 'cpp', ['cpp'])).toBeUndefined();
	});

	/** There is nothing to switch to, so there is nothing to say. */
	it('stays away with fewer than two modes', () => {
		expect(nudgeFor(['micropython'], 'micropython', ['cpp'])).toBeUndefined();
		expect(nudgeFor([], undefined, ['cpp'])).toBeUndefined();
	});

	it('stays away when nobody or several claim, rather than pointing at an arbitrary one', () => {
		expect(nudgeFor(['cpp', 'micropython'], 'micropython', [])).toBeUndefined();
		expect(nudgeFor(['cpp', 'micropython'], 'micropython', ['cpp', 'micropython'])).toBeUndefined();
	});

	it('ignores a claimant that is not registered', () => {
		expect(nudgeFor(['cpp', 'micropython'], 'micropython', ['ide'])).toBeUndefined();
	});
});
