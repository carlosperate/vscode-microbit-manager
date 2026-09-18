import type { MenuGroup } from '../../api';

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
 * undoes the menu rather than using it. The groups' entries sit between, ahead
 * of ours: a language's Flash is what the user came for, ours the safety net.
 */
export const menuOrder = (board: BoardState, theirs: readonly string[]): readonly string[] => {
	if (board === 'connected') return [...theirs, ...WORK, COMMANDS.disconnect];
	if (board === 'held-by-terminal') return [COMMANDS.connect, ...theirs, ...WORK, COMMANDS.disconnect];
	return [COMMANDS.connect, ...theirs, ...WORK];
};

/**
 * The palette's own entries plus every registered group's, ordered for a menu.
 * Both the titles and the exclusions come from the manifest, so this list cannot
 * drift from the palette it mirrors, and a command missing from the order still
 * appears, at the end: dropping one silently would make it unreachable.
 */
export function menuCommands(
	contributed: readonly Contributed[],
	palette: readonly PaletteEntry[],
	board: BoardState,
	groups: readonly MenuGroup[] = []
): Contributed[] {
	// Only a flat `false` is decidable here; any other clause is the workbench's to evaluate.
	const hidden = palette.filter((entry) => entry.when === 'false').map((entry) => entry.command);
	const ours = contributed.filter((entry) => !hidden.includes(entry.command) && pairingAllows(entry.command, board));
	// Named twice, offered once: ours keep our place and pairing rule, a shared one goes under the first group.
	const taken = new Set(contributed.map((entry) => entry.command));
	const theirs: Contributed[] = [];
	for (const { command, label } of groups.flatMap((group) => group.commands)) {
		if (taken.has(command)) continue;
		taken.add(command);
		theirs.push({ command, title: label });
	}
	const order = menuOrder(
		board,
		theirs.map((entry) => entry.command)
	);
	return [...ours, ...theirs].sort((a, b) => place(order, a.command) - place(order, b.command));
}

/** One labelled part of the menu. Only the leading one may go without a label. */
export interface MenuSection {
	label?: string;
	entries: Contributed[];
}

/**
 * Labelled sections, so a language's "Flash" and our "Flash hex to micro:bit"
 * never sit side by side unnamed. `ours` decides ownership only: a group may
 * name one of our commands, and the entry left standing is still ours.
 */
export function menuSections(
	entries: readonly Contributed[],
	groups: readonly MenuGroup[] = [],
	ours: readonly Contributed[] = []
): MenuSection[] {
	const own = new Set(ours.map((entry) => entry.command));
	const owner = (entry: Contributed) =>
		own.has(entry.command) ? undefined : groups.find((group) => group.commands.some((their) => their.command === entry.command));

	// A run per owner, ours included, which the order already keeps together.
	const runs: { group: MenuGroup | undefined; entries: Contributed[] }[] = [];
	for (const entry of entries) {
		const group = owner(entry);
		const last = runs[runs.length - 1];
		if (last && last.group === group) last.entries.push(entry);
		else runs.push({ group, entries: [entry] });
	}

	return runs.map(({ group, entries }, at) => {
		if (group) return { label: group.label, entries };
		return at === 0 ? { entries } : { label: PRODUCT, entries };
	});
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
