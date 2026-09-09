import { describe, expect, it } from 'vitest';

import { COMMANDS } from '../src/config';
import { menuCommands, type Contributed, type PaletteEntry } from '../src/ui/menu';

const contributed = (...commands: string[]): Contributed[] =>
	commands.map((command) => ({ command, title: command }));

const hiddenFromPalette = (...commands: string[]): PaletteEntry[] =>
	commands.map((command) => ({ command, when: 'false' }));

describe('the status bar menu', () => {
	it('leaves out whatever the manifest hides from the palette', () => {
		const entries = menuCommands(
			contributed(COMMANDS.showMenu, COMMANDS.flashHexFile),
			hiddenFromPalette(COMMANDS.showMenu)
		);
		expect(entries.map((entry) => entry.command)).toEqual([COMMANDS.flashHexFile]);
	});

	it('keeps a command whose palette clause is for the workbench to evaluate', () => {
		const palette: PaletteEntry[] = [{ command: COMMANDS.openTerminal, when: 'bbcmicrobit-manager.canPair' }];
		const entries = menuCommands(contributed(COMMANDS.openTerminal), palette);
		expect(entries.map((entry) => entry.command)).toEqual([COMMANDS.openTerminal]);
	});

	it('orders by the work rather than by the manifest', () => {
		const entries = menuCommands(contributed(COMMANDS.openTerminal, COMMANDS.flashHexFile), []);
		expect(entries.map((entry) => entry.command)).toEqual([COMMANDS.flashHexFile, COMMANDS.openTerminal]);
	});

	it('keeps a command it has no place for, at the end', () => {
		const entries = menuCommands(contributed('bbcmicrobit-manager.unplaced', COMMANDS.flashHexFile), []);
		expect(entries.map((entry) => entry.command)).toEqual([COMMANDS.flashHexFile, 'bbcmicrobit-manager.unplaced']);
	});

	it('takes the titles the manifest gives, so the menu cannot drift from the palette', () => {
		const entries = menuCommands([{ command: COMMANDS.flashHexFile, title: 'Flash Hex File' }], []);
		expect(entries[0]?.title).toBe('Flash Hex File');
	});

	it('does not sort the array it was handed', () => {
		const original = contributed(COMMANDS.openTerminal, COMMANDS.flashHexFile);
		menuCommands(original, []);
		expect(original.map((entry) => entry.command)).toEqual([COMMANDS.openTerminal, COMMANDS.flashHexFile]);
	});
});
