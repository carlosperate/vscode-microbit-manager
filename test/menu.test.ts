import { describe, expect, it } from 'vitest';

import { COMMANDS } from '../src/config';
import { menuCommands, menuOrder, type Contributed, type PaletteEntry } from '../src/ui/menu';

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

const commands = (connected: boolean | undefined) =>
	menuCommands(all, hiddenFromPalette(COMMANDS.showMenu), connected).map((entry) => entry.command);

const WORK = [COMMANDS.flashHexFile, COMMANDS.openTerminal];

describe('the status bar menu', () => {
	it('leaves out whatever the manifest hides from the palette', () => {
		expect(commands(false)).not.toContain(COMMANDS.showMenu);
		expect(commands(true)).not.toContain(COMMANDS.showMenu);
	});

	it('keeps a command whose palette clause is for the workbench to evaluate', () => {
		const palette: PaletteEntry[] = [{ command: COMMANDS.openTerminal, when: 'bbcmicrobit-manager.canPair' }];
		const entries = menuCommands(contributed(COMMANDS.openTerminal), palette, false);
		expect(entries.map((entry) => entry.command)).toEqual([COMMANDS.openTerminal]);
	});

	/** Nothing below it works until it has been done, so it leads. */
	it('puts Connect first while there is no board', () => {
		expect(commands(false)).toEqual([COMMANDS.connect, ...WORK]);
	});

	/** It undoes the menu rather than using it, so it trails. */
	it('puts Disconnect last once there is one', () => {
		expect(commands(true)).toEqual([...WORK, COMMANDS.disconnect]);
	});

	/**
	 * Desktop VS Code registers nothing that can authorise a USB device, so
	 * neither entry describes anything it can do. Offering Connect there is a
	 * button whose only outcome is an explanation of why it does nothing.
	 */
	it('offers neither where no board can be paired', () => {
		expect(commands(undefined)).toEqual(WORK);
	});

	it('keeps a command it has no place for, at the end', () => {
		const entries = menuCommands(contributed('bbcmicrobit-manager.unplaced', COMMANDS.flashHexFile), [], false);
		expect(entries.map((entry) => entry.command)).toEqual([COMMANDS.flashHexFile, 'bbcmicrobit-manager.unplaced']);
	});

	/**
	 * Being dropped from the only entry point most users find is a worse failure
	 * than being in the wrong place, so this pins the maintenance of the order as
	 * well as the fallback.
	 */
	it('places every command it contributes', () => {
		const placed = new Set([...menuOrder(true), ...menuOrder(false)]);
		const missing = Object.values(COMMANDS).filter((id) => id !== COMMANDS.showMenu && !placed.has(id));
		expect(missing, 'add these to the menu order').toEqual([]);
	});

	it('takes the titles the manifest gives, so the menu cannot drift from the palette', () => {
		const entries = menuCommands([{ command: COMMANDS.flashHexFile, title: 'Flash Hex File' }], [], false);
		expect(entries[0]?.title).toBe('Flash Hex File');
	});

	it('does not sort the array it was handed', () => {
		const original = contributed(COMMANDS.openTerminal, COMMANDS.flashHexFile);
		menuCommands(original, [], false);
		expect(original.map((entry) => entry.command)).toEqual([COMMANDS.openTerminal, COMMANDS.flashHexFile]);
	});
});
