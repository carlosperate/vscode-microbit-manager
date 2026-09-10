import { describe, expect, it } from 'vitest';

import { COMMANDS } from '../src/config';
import { menuCommands, menuOrder, type BoardState, type Contributed, type PaletteEntry } from '../src/ui/menu';

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
	COMMANDS.showMenu
);

const commands = (board: BoardState) =>
	menuCommands(all, hiddenFromPalette(COMMANDS.showMenu), board).map((entry) => entry.command);

const WORK = [COMMANDS.flashHexFile, COMMANDS.openTerminal];

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
		const placed = new Set(states.flatMap((state) => [...menuOrder(state)]));
		const missing = Object.values(COMMANDS).filter((id) => id !== COMMANDS.showMenu && !placed.has(id));
		expect(missing, 'add these to the menu order').toEqual([]);
	});

	it('takes the titles the manifest gives, so the menu cannot drift from the palette', () => {
		const entries = menuCommands([{ command: COMMANDS.flashHexFile, title: 'Flash Hex File' }], [], 'disconnected');
		expect(entries[0]?.title).toBe('Flash Hex File');
	});

	it('does not sort the array it was handed', () => {
		const original = contributed(COMMANDS.openTerminal, COMMANDS.flashHexFile);
		menuCommands(original, [], 'disconnected');
		expect(original.map((entry) => entry.command)).toEqual([COMMANDS.openTerminal, COMMANDS.flashHexFile]);
	});
});
