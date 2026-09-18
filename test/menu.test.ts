import type { MenuGroup } from '../api';
import { describe, expect, it } from 'vitest';

import { COMMANDS, PRODUCT } from '../src/config';
import { menuCommands, menuOrder, menuSections, type BoardState, type Contributed, type PaletteEntry } from '../src/ui/menu';

const contributed = (...commands: string[]): Contributed[] =>
	commands.map((command) => ({ command, title: command }));

const hiddenFromPalette = (...commands: string[]): PaletteEntry[] =>
	commands.map((command) => ({ command, when: 'false' }));

/** The manifest's own order, which is not the menu's. */
const all = contributed(COMMANDS.connect, COMMANDS.disconnect, COMMANDS.flashHexFile, COMMANDS.openTerminal, COMMANDS.showMenu);

const commands = (board: BoardState, groups: MenuGroup[] = []) =>
	menuCommands(all, hiddenFromPalette(COMMANDS.showMenu), board, groups).map((entry) => entry.command);

const WORK = [COMMANDS.flashHexFile, COMMANDS.openTerminal];

/** What a language extension with a build step offers. */
const FAKE: MenuGroup = {
	label: 'Fake',
	commands: [
		{ command: 'fake.build', label: 'Build' },
		{ command: 'fake.flash', label: 'Flash' },
	],
};

/** A second one. */
const OTHER: MenuGroup = { label: 'Other', commands: [{ command: 'other.hello', label: 'Say Hello' }] };

describe('the status bar menu', () => {
	it('leaves out whatever the manifest hides from the palette', () => {
		expect(commands('disconnected')).not.toContain(COMMANDS.showMenu);
		expect(commands('connected')).not.toContain(COMMANDS.showMenu);
	});

	it('keeps a command whose palette clause is for the workbench to evaluate', () => {
		const palette: PaletteEntry[] = [{ command: COMMANDS.openTerminal, when: 'bbcmicrobit-manager.canPair' }];
		const entries = menuCommands(contributed(COMMANDS.openTerminal), palette, 'disconnected');
		expect(entries.map((entry) => entry.command)).toEqual([COMMANDS.openTerminal]);
	});

	/** Nothing below it works until it has been done, so it leads. */
	it('puts Connect first while there is no board', () => {
		expect(commands('disconnected')).toEqual([COMMANDS.connect, ...WORK]);
	});

	/** It undoes the menu rather than using it, so it trails. */
	it('puts Disconnect last once there is one', () => {
		expect(commands('connected')).toEqual([...WORK, COMMANDS.disconnect]);
	});

	/**
	 * Desktop VS Code registers nothing that can authorise a USB device, so
	 * neither entry describes anything it can do. Offering Connect there is a
	 * button whose only outcome is an explanation of why it does nothing.
	 */
	it('offers neither where no board can be paired', () => {
		expect(commands('unpairable')).toEqual(WORK);
	});

	/**
	 * The Web Serial route: a terminal holds the port and this extension has no
	 * connection of its own. Both entries are true at once, and hiding Disconnect
	 * is what leaves a user holding a live terminal with no way to ask what has
	 * the board.
	 */
	it('offers both while a terminal holds the board', () => {
		expect(commands('held-by-terminal')).toEqual([COMMANDS.connect, ...WORK, COMMANDS.disconnect]);
	});

	it('keeps a command it has no place for, at the end', () => {
		const entries = menuCommands(
			contributed('bbcmicrobit-manager.unplaced', COMMANDS.flashHexFile),
			[],
			'disconnected'
		);
		expect(entries.map((entry) => entry.command)).toEqual([COMMANDS.flashHexFile, 'bbcmicrobit-manager.unplaced']);
	});

	/**
	 * Being dropped from the only entry point most users find is a worse failure
	 * than being in the wrong place, so this pins the maintenance of the order as
	 * well as the fallback.
	 */
	it('places every command it contributes, in every state', () => {
		const states: BoardState[] = ['unpairable', 'disconnected', 'connected', 'held-by-terminal'];
		const placed = new Set(states.flatMap((state) => [...menuOrder(state, [])]));
		const missing = Object.values(COMMANDS).filter((id) => id !== COMMANDS.showMenu && !placed.has(id));
		expect(missing, 'add these to the menu order').toEqual([]);
	});

	/**
	 * A language's Flash is what the user came for and ours is the safety net, so
	 * its entries go ahead of ours, after Connect where there is one. In its own
	 * words: the label is the one it registered, not a manifest title.
	 */
	it('puts a group between Connect and ours', () => {
		expect(commands('disconnected', [FAKE])).toEqual([COMMANDS.connect, 'fake.build', 'fake.flash', ...WORK]);
		expect(commands('connected', [FAKE])).toEqual(['fake.build', 'fake.flash', ...WORK, COMMANDS.disconnect]);
		expect(commands('unpairable', [FAKE])).toEqual(['fake.build', 'fake.flash', ...WORK]);

		const entries = menuCommands(all, [], 'unpairable', [FAKE]);
		expect(entries.find((entry) => entry.command === 'fake.build')?.title).toBe('Build');
	});

	it('lists every group, in the order it is given', () => {
		expect(commands('disconnected', [OTHER, FAKE])).toEqual([
			COMMANDS.connect,
			'other.hello',
			'fake.build',
			'fake.flash',
			...WORK,
		]);
	});

	/** Ours are always offered, so a group listing one of them would show it twice, once under its own name. */
	it('shows a command of ours once even when a group lists it too', () => {
		const listing: MenuGroup[] = [
			{ ...FAKE, commands: [...FAKE.commands, { command: COMMANDS.openTerminal, label: 'Terminal' }] },
		];
		expect(commands('disconnected', listing)).toEqual([COMMANDS.connect, 'fake.build', 'fake.flash', ...WORK]);
		const entries = menuCommands(all, [], 'disconnected', listing);
		expect(entries.find((entry) => entry.command === COMMANDS.openTerminal)?.title).toBe(COMMANDS.openTerminal);
	});

	/** A menu row that runs the same thing twice is a bug, not a choice. */
	it('shows a command two groups both name once, under the first of them', () => {
		const shared = { command: 'shared.cmd', label: 'Shared' };
		const both: MenuGroup[] = [
			{ ...FAKE, commands: [shared] },
			{ ...OTHER, commands: [shared, ...OTHER.commands] },
		];
		expect(commands('unpairable', both)).toEqual(['shared.cmd', 'other.hello', ...WORK]);
	});

	it('keeps Flash hex to micro:bit and Open Serial Terminal whatever the groups offer', () => {
		expect(commands('disconnected', [FAKE, OTHER])).toEqual(expect.arrayContaining(WORK));
	});

	it('takes the titles the manifest gives, so the menu cannot drift from the palette', () => {
		const entries = menuCommands(
			[{ command: COMMANDS.flashHexFile, title: 'Flash hex to micro:bit' }],
			[],
			'disconnected'
		);
		expect(entries[0]?.title).toBe('Flash hex to micro:bit');
	});

	it('does not sort the array it was handed', () => {
		const original = contributed(COMMANDS.openTerminal, COMMANDS.flashHexFile);
		menuCommands(original, [], 'disconnected');
		expect(original.map((entry) => entry.command)).toEqual([COMMANDS.openTerminal, COMMANDS.flashHexFile]);
	});
});

/**
 * One language's "Flash", another's and our "Flash hex to micro:bit" read as
 * duplicates side by side, so the menu names who owns each part: the labels
 * the groups registered, and this extension's name.
 */
describe('the menu in sections', () => {
	const sectioned = (board: BoardState, groups: MenuGroup[] = [FAKE]) =>
		menuSections(menuCommands(all, hiddenFromPalette(COMMANDS.showMenu), board, groups), groups, all).map((section) => ({
			label: section.label,
			commands: section.entries.map((entry) => entry.command),
		}));

	it('leaves Connect bare at the top, then the group under its label, then ours under this extension', () => {
		expect(sectioned('disconnected')).toEqual([
			{ label: undefined, commands: [COMMANDS.connect] },
			{ label: 'Fake', commands: ['fake.build', 'fake.flash'] },
			{ label: PRODUCT, commands: WORK },
		]);
	});

	it('starts with the group when nothing leads it', () => {
		expect(sectioned('connected')).toEqual([
			{ label: 'Fake', commands: ['fake.build', 'fake.flash'] },
			{ label: PRODUCT, commands: [...WORK, COMMANDS.disconnect] },
		]);
	});

	it('gives each group a section of its own', () => {
		expect(sectioned('disconnected', [OTHER, FAKE])).toEqual([
			{ label: undefined, commands: [COMMANDS.connect] },
			{ label: 'Other', commands: ['other.hello'] },
			{ label: 'Fake', commands: ['fake.build', 'fake.flash'] },
			{ label: PRODUCT, commands: WORK },
		]);
	});

	/**
	 * A group may name one of our commands, and the row left standing is ours, so
	 * it belongs in our section: taking it into the group's would split ours in
	 * two and repeat the group's separator around them.
	 */
	it('keeps a command of ours in our section even when a group names it too', () => {
		const listing: MenuGroup[] = [
			{ ...FAKE, commands: [...FAKE.commands, { command: COMMANDS.openTerminal, label: 'Terminal' }] },
		];
		expect(sectioned('connected', listing)).toEqual([
			{ label: 'Fake', commands: ['fake.build', 'fake.flash'] },
			{ label: PRODUCT, commands: [...WORK, COMMANDS.disconnect] },
		]);
	});

	/** With nothing to tell apart, a separator would only name the one owner there is. */
	it('draws no separators when no group offers anything', () => {
		const ours = menuCommands(all, hiddenFromPalette(COMMANDS.showMenu), 'disconnected');
		expect(menuSections(ours, [])).toEqual([{ entries: ours }]);
		expect(menuSections(ours, [{ label: 'Empty', commands: [] }])).toEqual([{ entries: ours }]);
	});
});
