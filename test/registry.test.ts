import type { Mode } from '../api';
import { describe, expect, it } from 'vitest';

import { admit, describeInvalid, IncompatibleApiError, ModeRegistry } from '../src/modes/registry';

const SERVED = '1.2.0';

const mode = (over: Partial<Mode> = {}): Mode => ({
	apiVersion: '1.0.0',
	id: 'fake',
	extensionId: 'test.fake-mode',
	label: 'Fake',
	...over,
});

describe('admitting a mode', () => {
	it('returns the candidate once it passes', () => {
		const candidate = mode();
		expect(admit(candidate, SERVED)).toBe(candidate);
	});

	it('names the field that is wrong', () => {
		expect(describeInvalid(undefined)).toMatch(/must be an object/);
		expect(describeInvalid(mode({ id: undefined as unknown as string }))).toMatch(/`id`/);
		expect(describeInvalid(mode({ id: 'Micro Python' }))).toMatch(/`id`/);
		expect(describeInvalid(mode({ extensionId: 'no-publisher' }))).toMatch(/`extensionId`/);
		expect(describeInvalid(mode({ label: '  ' }))).toMatch(/`label`/);
		expect(describeInvalid(mode({ apiVersion: '1.0' }))).toMatch(/`apiVersion`/);
		expect(describeInvalid(mode({ claimsWorkspace: true as unknown as () => Promise<boolean> }))).toMatch(
			/`claimsWorkspace`/
		);
		expect(describeInvalid(mode({ menuCommands: [{ command: 'x' }] as unknown as Mode['menuCommands'] }))).toMatch(
			/`menuCommands`/
		);
		expect(describeInvalid(mode({ boardPanel: 'yes' as unknown as boolean }))).toMatch(/`boardPanel`/);
	});

	it('accepts every optional member when it is well formed', () => {
		expect(
			describeInvalid(
				mode({
					claimsWorkspace: () => Promise.resolve(true),
					onDidChangeWorkspaceClaim: () => ({ dispose() {} }),
					menuCommands: [{ command: 'fake.flash', label: 'Flash' }],
					boardPanel: true,
				})
			)
		).toBeUndefined();
	});

	it('throws a TypeError for a malformed candidate, naming the field', () => {
		expect(() => admit({ label: 'No id' }, SERVED)).toThrow(TypeError);
		expect(() => admit({ label: 'No id' }, SERVED)).toThrow(/`id`/);
	});

	/** The message has to say which extension to update, so the error carries both sides. */
	it('throws IncompatibleApiError when the versions do not meet, saying who is behind', () => {
		let thrown: unknown;
		try {
			admit(mode({ apiVersion: '1.3.0' }), SERVED);
		} catch (error) {
			thrown = error;
		}
		expect(thrown).toBeInstanceOf(IncompatibleApiError);
		const refusal = thrown as IncompatibleApiError;
		expect(refusal.name).toBe('IncompatibleApiError');
		expect(refusal.behind).toBe('manager');
		expect(refusal.extensionId).toBe('test.fake-mode');
		expect(refusal.label).toBe('Fake');
		expect(refusal.wanted).toBe('1.3.0');
		expect(refusal.served).toBe(SERVED);

		expect(() => admit(mode({ apiVersion: '0.9.0' }), SERVED)).toThrow(IncompatibleApiError);
	});

	it('serves an older mode of the same major', () => {
		expect(() => admit(mode({ apiVersion: '1.0.0' }), SERVED)).not.toThrow();
	});
});

describe('the registry', () => {
	it('holds what was registered until the undo is called', () => {
		const registry = new ModeRegistry();
		const undo = registry.register(mode());
		expect(registry.ids()).toEqual(['fake']);
		undo();
		expect(registry.ids()).toEqual([]);
	});

	it('refuses a second mode with the same id, naming who has it', () => {
		const registry = new ModeRegistry();
		registry.register(mode({ extensionId: 'first.owner' }));
		expect(() => registry.register(mode({ extensionId: 'second.owner' }))).toThrow(/first\.owner/);
		expect(registry.get('fake')?.extensionId).toBe('first.owner');
	});

	/** Registration order is activation order, which nothing promises. */
	it('lists modes by id, not by the order they arrived', () => {
		const registry = new ModeRegistry();
		registry.register(mode({ id: 'micropython' }));
		registry.register(mode({ id: 'cpp' }));
		registry.register(mode({ id: 'ide' }));
		expect(registry.ids()).toEqual(['cpp', 'ide', 'micropython']);
	});

	it('lets an undo run twice, and never removes a later registration of the same id', () => {
		const registry = new ModeRegistry();
		const undo = registry.register(mode());
		undo();
		const again = mode();
		registry.register(again);
		undo();
		expect(registry.get('fake')).toBe(again);
	});
});
