import { describe, expect, it } from 'vitest';

import { MenuGroups } from '../src/menuGroups';

const group = (label: string, command = `${label.toLowerCase()}.flash`) => ({ label, commands: [{ command, label: 'Flash' }] });

/** The one message another extension's author gets, so it has to name what to fix. */
const refusal = (candidate: unknown): string => {
	try {
		new MenuGroups().register(candidate);
		return 'accepted';
	} catch (error) {
		return error instanceof TypeError ? error.message : `not a TypeError: ${String(error)}`;
	}
};

describe('menu groups', () => {
	it('lists a group until its undo runs, and the undo is safe to run twice', () => {
		const groups = new MenuGroups();
		const undo = groups.register(group('Fake'));
		expect(groups.list().map((entry) => entry.label)).toEqual(['Fake']);
		undo();
		undo();
		expect(groups.list()).toEqual([]);
	});

	/** Activation order differs between windows, and a menu that reorders itself is one nobody learns. */
	it('lists by label, whatever order they registered in', () => {
		const groups = new MenuGroups();
		groups.register(group('MicroPython'));
		groups.register(group('C++'));
		expect(groups.list().map((entry) => entry.label)).toEqual(['C++', 'MicroPython']);
	});

	it('shows two groups with the same label as two', () => {
		const groups = new MenuGroups();
		groups.register(group('Same', 'a.flash'));
		groups.register(group('Same', 'b.flash'));
		expect(groups.list()).toHaveLength(2);
	});

	/** The group comes from another extension, which may reuse its object for something else. */
	it('keeps what was registered, not the object it was handed', () => {
		const groups = new MenuGroups();
		const mine = { label: 'Fake', commands: [{ command: 'fake.flash', label: 'Flash' }] };
		groups.register(mine);
		mine.label = '';
		mine.commands.push({ command: 'fake.other', label: 'Other' });
		expect(groups.list()).toEqual([{ label: 'Fake', commands: [{ command: 'fake.flash', label: 'Flash' }] }]);
	});

	it('refuses a malformed group, naming the field', () => {
		expect(refusal(undefined)).toContain('must be an object');
		expect(refusal({ label: ' ', commands: [] })).toContain('`label`');
		expect(refusal({ label: 'Fake' })).toContain('`commands`');
		expect(refusal({ label: 'Fake', commands: [{ command: 'fake.flash' }] })).toContain('`commands`');
		expect(refusal({ label: 'Fake', commands: [{ command: 'fake.flash', label: ' ' }] })).toContain('`commands`');
		expect(refusal({ label: 'Fake', commands: [{ command: '', label: 'Flash' }] })).toContain('`commands`');
		expect(refusal({ label: 'Fake', commands: [] })).toBe('accepted');
	});
});
