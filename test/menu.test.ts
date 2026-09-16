import { describe, expect, it } from 'vitest';

import { COMMANDS, PRODUCT } from '../src/config';
import {
	menuCommands,
	menuOrder,
	menuSections,
	type BoardState,
	type Contributed,
	type ModeEntry,
	type PaletteEntry,
} from '../src/ui/menu';

const contributed = (...commands: string[]): Contributed[] =>
	commands.map((command) => ({ command, title: command }));

const hiddenFromPalette = (...commands: string[]): PaletteEntry[] =>
	commands.map((command) => ({ command, when: 'false' }));

/** The manifest's own order, which is not the menu's. */
const all = contributed(
	COMMANDS.connect,
	COMMANDS.disconnect,
	COMMANDS.flashHexFile,
	COMMANDS.openTerminal,
	COMMANDS.switchMode,
	COMMANDS.showMenu
);

const commands = (board: BoardState, mode: ModeEntry[] = [], canSwitch = false) =>
	menuCommands(all, hiddenFromPalette(COMMANDS.showMenu), board, mode, canSwitch).map((entry) => entry.command);

const WORK = [COMMANDS.flashHexFile, COMMANDS.openTerminal];

/** What a mode with a build step offers. */
const MODE: ModeEntry[] = [
	{ command: 'fake.build', label: 'Build' },
	{ command: 'fake.flash', label: 'Flash' },
];

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

	/** Switching changes the menu rather than using it, so it follows the work; with one mode there is nothing to switch to. */
	it('offers Switch Mode after the work, and only with something to switch to', () => {
		expect(commands('disconnected', [], true)).toEqual([COMMANDS.connect, ...WORK, COMMANDS.switchMode]);
		expect(commands('connected', [], true)).toEqual([...WORK, COMMANDS.switchMode, COMMANDS.disconnect]);
		expect(commands('disconnected', [], false)).not.toContain(COMMANDS.switchMode);
	});

	/**
	 * The mode's Flash is what the user came for and ours is the safety net, so
	 * the mode's entries go ahead of ours, after Connect where there is one. In
	 * its own words: the label is the mode's, not a manifest title.
	 */
	it('offers the active mode its own entries, between Connect and ours', () => {
		expect(commands('disconnected', MODE)).toEqual([COMMANDS.connect, 'fake.build', 'fake.flash', ...WORK]);
		expect(commands('connected', MODE)).toEqual(['fake.build', 'fake.flash', ...WORK, COMMANDS.disconnect]);
		expect(commands('unpairable', MODE)).toEqual(['fake.build', 'fake.flash', ...WORK]);

		const entries = menuCommands(all, [], 'unpairable', MODE);
		expect(entries.find((entry) => entry.command === 'fake.build')?.title).toBe('Build');
	});

	/** Ours are always offered, so a mode listing one of them would show it twice, once under its own name. */
	it('shows a command of ours once even when the mode lists it too', () => {
		const listing: ModeEntry[] = [...MODE, { command: COMMANDS.openTerminal, label: 'Terminal' }];
		expect(commands('disconnected', listing)).toEqual([COMMANDS.connect, 'fake.build', 'fake.flash', ...WORK]);
		const entries = menuCommands(all, [], 'disconnected', listing);
		expect(entries.find((entry) => entry.command === COMMANDS.openTerminal)?.title).toBe(COMMANDS.openTerminal);
	});

	/** Every shape keeps our two, so a mode offering neither leaves nothing unreachable. */
	it('keeps Flash hex to micro:bit and Open Serial Terminal whatever the mode offers', () => {
		expect(commands('disconnected', [])).toEqual(expect.arrayContaining(WORK));
		expect(commands('disconnected', MODE)).toEqual(expect.arrayContaining(WORK));
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
 * A mode's "Flash" beside our "Flash hex to micro:bit" reads as a duplicate, so
 * the menu names who owns each group. The names are the mode's own label and
 * this extension's, which is all the manager knows about either.
 */
describe('the menu in sections', () => {
	const mode = { label: 'Fake', entries: MODE };
	const sectioned = (board: BoardState) =>
		menuSections(menuCommands(all, hiddenFromPalette(COMMANDS.showMenu), board, MODE, true), mode).map(
			(section) => ({ label: section.label, commands: section.entries.map((entry) => entry.command) })
		);

	it('leaves Connect bare at the top, then the mode under its name, then ours under this extension', () => {
		expect(sectioned('disconnected')).toEqual([
			{ label: undefined, commands: [COMMANDS.connect] },
			{ label: 'Fake', commands: ['fake.build', 'fake.flash'] },
			{ label: PRODUCT, commands: [...WORK, COMMANDS.switchMode] },
		]);
	});

	it('starts with the mode when nothing leads it', () => {
		expect(sectioned('connected')).toEqual([
			{ label: 'Fake', commands: ['fake.build', 'fake.flash'] },
			{ label: PRODUCT, commands: [...WORK, COMMANDS.switchMode, COMMANDS.disconnect] },
		]);
	});

	/** With nothing to tell apart, a separator would only name the one owner there is. */
	it('draws no separators when the mode offers nothing, or there is no mode', () => {
		const ours = menuCommands(all, hiddenFromPalette(COMMANDS.showMenu), 'disconnected');
		expect(menuSections(ours, undefined)).toEqual([{ entries: ours }]);
		expect(menuSections(ours, { label: 'Plain', entries: [] })).toEqual([{ entries: ours }]);
	});
});
