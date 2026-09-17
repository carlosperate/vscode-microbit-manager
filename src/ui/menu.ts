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

/** What a mode offers in the menu, in its own words. */
export interface ModeEntry {
	command: string;
	label: string;
}

/** One mode's share of the menu: its name for the separator, its entries in its words. */
export interface ModeMenu {
	readonly label: string;
	readonly active: boolean;
	readonly entries: readonly ModeEntry[];
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
 * undoes the menu rather than using it. The modes' own entries sit between,
 * ahead of ours: a mode's Flash is what the user came for, and ours is the
 * safety net. Switch Mode comes after the work, since it changes the menu rather
 * than using it; whether it is offered at all is the filter's decision, not the
 * order's.
 */
export const menuOrder = (board: BoardState, modes: readonly string[]): readonly string[] => {
	if (board === 'connected') return [...modes, ...WORK, COMMANDS.switchMode, COMMANDS.disconnect];
	if (board === 'held-by-terminal') return [COMMANDS.connect, ...modes, ...WORK, COMMANDS.switchMode, COMMANDS.disconnect];
	return [COMMANDS.connect, ...modes, ...WORK, COMMANDS.switchMode];
};

/**
 * The palette's own entries plus every registered mode's, ordered for a menu.
 * Both the titles and the exclusions come from the manifest, so this list cannot
 * drift from the palette it mirrors, and a command missing from the order still
 * appears, at the end: dropping one silently would make it unreachable.
 *
 * Every mode is offered, not only the active one: switching the panel to reach a
 * command is a detour, and the mode's own command takes the panel with it if it
 * needs its views.
 */
export function menuCommands(
	contributed: readonly Contributed[],
	palette: readonly PaletteEntry[],
	board: BoardState,
	modes: readonly ModeMenu[] = [],
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
	// A command named twice is offered once: ours where ours sit, since they are
	// always there, and a command two modes both name under the first of them.
	const taken = new Set(contributed.map((entry) => entry.command));
	const theirs: Contributed[] = [];
	for (const { command, label } of modes.flatMap((mode) => mode.entries)) {
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

/** One labelled group of the menu. Only the leading group may go without a label. */
export interface MenuSection {
	label?: string;
	entries: Contributed[];
}

/** How the active mode's separator says so, where more than one mode is named. */
const ACTIVE = (label: string) => `${label} (active)`;

/**
 * The menu in sections, so one mode's "Flash", another's and our "Flash hex to
 * micro:bit" never sit side by side unlabelled: whatever leads stays bare, each
 * mode's entries go under its name, and ours under this extension's. With one
 * mode named there is nothing to tell apart, so its separator drops the marker;
 * with none there are no separators at all.
 *
 * `ours` is the manifest's own commands, which decide nothing but ownership: a
 * mode may name one of them, and the entry left standing is still ours.
 */
export function menuSections(
	entries: readonly Contributed[],
	modes: readonly ModeMenu[] = [],
	ours: readonly Contributed[] = []
): MenuSection[] {
	const own = new Set(ours.map((entry) => entry.command));
	const owner = (entry: Contributed) =>
		own.has(entry.command) ? undefined : modes.find((mode) => mode.entries.some((their) => their.command === entry.command));

	// A run per owner, ours included, which the order already keeps together.
	const runs: { mode: ModeMenu | undefined; entries: Contributed[] }[] = [];
	for (const entry of entries) {
		const mode = owner(entry);
		const last = runs[runs.length - 1];
		if (last && last.mode === mode) last.entries.push(entry);
		else runs.push({ mode, entries: [entry] });
	}

	// The modes that ended up with a group, counted as modes however the runs fell.
	const named = new Set(runs.map((run) => run.mode).filter((mode) => mode !== undefined)).size;
	return runs.map(({ mode, entries }, at) => {
		if (!mode) return at === 0 ? { entries } : { label: PRODUCT, entries };
		return { label: mode.active && named > 1 ? ACTIVE(mode.label) : mode.label, entries };
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
