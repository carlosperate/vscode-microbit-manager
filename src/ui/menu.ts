import { COMMANDS } from '../config';

/** One row of `contributes.commands`, which is where the menu's titles come from. */
export interface Contributed {
	command: string;
	title: string;
}

/** One row of `contributes.menus.commandPalette`, which is where the palette's exclusions come from. */
export interface PaletteEntry {
	command: string;
	when?: string;
}

/** In the order the work happens, which is neither the manifest's nor the palette's. */
const WORK: readonly string[] = [COMMANDS.flashHexFile, COMMANDS.openTerminal];

/**
 * The palette's own entries, ordered for a menu. Both the titles and the
 * exclusions come from the manifest, so this list cannot drift from the palette
 * it mirrors, and a command missing from `WORK` still appears, at the end:
 * dropping one silently would make it unreachable.
 */
export function menuCommands(contributed: readonly Contributed[], palette: readonly PaletteEntry[]): Contributed[] {
	// Only a flat `false` is decidable here; any other clause is the workbench's to evaluate.
	const hidden = palette.filter((entry) => entry.when === 'false').map((entry) => entry.command);
	// `filter` already answers with a new array, so the sort is not the caller's.
	return contributed
		.filter((entry) => !hidden.includes(entry.command))
		.sort((a, b) => place(a.command) - place(b.command));
}

/** Unplaced commands sort after every placed one, keeping their manifest order. */
const place = (command: string) => {
	const at = WORK.indexOf(command);
	return at === -1 ? WORK.length : at;
};
