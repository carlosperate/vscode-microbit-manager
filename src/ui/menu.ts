import { COMMANDS, PRODUCT } from '../config';

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

/** What the active mode offers in the menu, in its own words. */
export interface ModeEntry {
	command: string;
	label: string;
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
 * undoes the menu rather than using it. The mode's own entries sit between, ahead
 * of ours: its Flash is what the user came for, and ours is the safety net.
 * Switch Mode comes after the work, since it changes the menu rather than using
 * it; whether it is offered at all is the filter's decision, not the order's.
 */
export const menuOrder = (board: BoardState, mode: readonly string[]): readonly string[] => {
	if (board === 'connected') return [...mode, ...WORK, COMMANDS.switchMode, COMMANDS.disconnect];
	if (board === 'held-by-terminal') return [COMMANDS.connect, ...mode, ...WORK, COMMANDS.switchMode, COMMANDS.disconnect];
	return [COMMANDS.connect, ...mode, ...WORK, COMMANDS.switchMode];
};

/**
 * The palette's own entries plus the active mode's, ordered for a menu. Both the
 * titles and the exclusions come from the manifest, so this list cannot drift
 * from the palette it mirrors, and a command missing from the order still
 * appears, at the end: dropping one silently would make it unreachable.
 */
export function menuCommands(
	contributed: readonly Contributed[],
	palette: readonly PaletteEntry[],
	board: BoardState,
	mode: readonly ModeEntry[] = [],
	canSwitch = false
): Contributed[] {
	// Only a flat `false` is decidable here; any other clause is the workbench's to evaluate.
	const hidden = palette.filter((entry) => entry.when === 'false').map((entry) => entry.command);
	const ours = contributed.filter(
		(entry) =>
			!hidden.includes(entry.command) &&
			pairingAllows(entry.command, board) &&
			(entry.command !== COMMANDS.switchMode || canSwitch)
	);
	// A mode naming one of our commands gets it once, where ours sit: they are always offered.
	const own = new Set(contributed.map((entry) => entry.command));
	const theirs = mode.filter(({ command }) => !own.has(command)).map(({ command, label }) => ({ command, title: label }));
	const order = menuOrder(
		board,
		theirs.map((entry) => entry.command)
	);
	return [...ours, ...theirs].sort((a, b) => place(order, a.command) - place(order, b.command));
}

/** One labelled group of the menu. Only the leading group may go without a label. */
export interface MenuSection {
	label?: string;
	entries: Contributed[];
}

/** The active mode's share of the menu: its name for the separator, its entries in its words. */
export interface ActiveModeMenu {
	readonly label: string;
	readonly entries: readonly ModeEntry[];
}

/**
 * The menu in sections, so a mode's "Flash" and our "Flash hex to micro:bit"
 * never sit side by side unlabelled: whatever leads the mode's entries stays
 * bare, the mode's own go under its name, and ours under this extension's. With
 * no mode entries there is nothing to tell apart, and no separators.
 */
export function menuSections(entries: readonly Contributed[], mode: ActiveModeMenu | undefined): MenuSection[] {
	const isMode = (entry: Contributed) => mode?.entries.some((own) => own.command === entry.command) ?? false;
	const first = entries.findIndex(isMode);
	if (!mode || first === -1) return [{ entries: [...entries] }];
	const last = entries.length - 1 - [...entries].reverse().findIndex(isMode);

	const sections: MenuSection[] = [];
	if (first > 0) sections.push({ entries: entries.slice(0, first) });
	sections.push({ label: mode.label, entries: entries.slice(first, last + 1) });
	if (last + 1 < entries.length) sections.push({ label: PRODUCT, entries: entries.slice(last + 1) });
	return sections;
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
