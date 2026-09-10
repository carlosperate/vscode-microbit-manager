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
 * What holds the board, which decides which of Connect and Disconnect describe
 * anything. `held-by-terminal` is the Web Serial route: a terminal has the port
 * and this extension has no connection of its own, so both entries are true at
 * once, one to pair properly and one to say what is holding it.
 */
export type BoardState = 'unpairable' | 'disconnected' | 'connected' | 'held-by-terminal';

/**
 * Connect leads when nothing below it can work yet; Disconnect trails, since it
 * undoes the menu rather than using it.
 */
export const menuOrder = (board: BoardState): readonly string[] => {
	if (board === 'connected') return [...WORK, COMMANDS.disconnect];
	if (board === 'held-by-terminal') return [COMMANDS.connect, ...WORK, COMMANDS.disconnect];
	return [COMMANDS.connect, ...WORK];
};

/**
 * The palette's own entries, ordered for a menu. Both the titles and the
 * exclusions come from the manifest, so this list cannot drift from the palette
 * it mirrors, and a command missing from the order still appears, at the end:
 * dropping one silently would make it unreachable.
 */
export function menuCommands(
	contributed: readonly Contributed[],
	palette: readonly PaletteEntry[],
	board: BoardState
): Contributed[] {
	// Only a flat `false` is decidable here; any other clause is the workbench's to evaluate.
	const hidden = palette.filter((entry) => entry.when === 'false').map((entry) => entry.command);
	const order = menuOrder(board);
	// `filter` already answers with a new array, so the sort is not the caller's.
	return contributed
		.filter((entry) => !hidden.includes(entry.command) && pairingAllows(entry.command, board))
		.sort((a, b) => place(order, a.command) - place(order, b.command));
}

/**
 * `unpairable` is a host with no way to authorise a board at all, so neither
 * entry describes anything it can do and both go. Every other command stays,
 * because the board is not what they are for.
 */
function pairingAllows(command: string, board: BoardState): boolean {
	const aboutPairing = command === COMMANDS.connect || command === COMMANDS.disconnect;
	if (board === 'unpairable') return !aboutPairing;
	if (command === COMMANDS.connect) return board !== 'connected';
	if (command === COMMANDS.disconnect) return board !== 'disconnected';
	return true;
}

/** Unplaced commands sort after every placed one, keeping their manifest order. */
const place = (order: readonly string[], command: string) => {
	const at = order.indexOf(command);
	return at === -1 ? order.length : at;
};
