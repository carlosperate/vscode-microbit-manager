/**
 * The modes as the rest of this extension sees them: who registered, which one
 * is active, and the context keys gating everyone's views. The decisions live in
 * `policy.ts` and `registry.ts`; this is the `vscode` around them.
 */
import type { Mode } from '../../api';
import * as vscode from 'vscode';

import {
	ACTIVE_MODE_CONTEXT,
	API_VERSION,
	BOARD_PANEL_MODES_CONTEXT,
	CHOSEN_MODE_STATE,
	LAST_MODE_STATE,
	MANY_MODES_CONTEXT,
	NO_MODES_CONTEXT,
	PRODUCT,
} from '../config';
import { setContext } from '../context';
import { log } from '../log';
import { openExtensionPage } from '../ui/extensionPage';
import type { ModeMenu } from '../ui/menu';
import type { SwitcherState } from '../webview/protocol';
import { nudgeFor, pickMode, shapeOf, worthRemembering, type Shape } from './policy';
import { admit, IncompatibleApiError, ModeRegistry } from './registry';

/** Long enough to swallow the events of one save or delete, short enough to feel immediate. */
const CLAIM_BURST_MS = 50;

/** The active mode as the rest of the panel reads it: what it declared, nothing it can do. */
export type ActiveMode = Pick<Mode, 'id' | 'label' | 'boardPanel'>;

/** What the switcher draws, plus what the rest of the panel needs to know about the modes. */
export interface Snapshot extends SwitcherState {
	readonly shape: Shape;
	readonly mode: ActiveMode | undefined;
	/** Every registered mode's menu entries, in the switcher's order: the status bar offers them all. */
	readonly menus: readonly ModeMenu[];
}

export interface Modes {
	/** The API's `registerMode`, which throws to refuse. */
	registerMode(candidate: unknown): vscode.Disposable;
	activeMode(): string | undefined;
	readonly onDidChangeActiveMode: vscode.Event<string | undefined>;
	snapshot(): Snapshot;
	/** Anything the switcher would draw differently: a registration, the active mode, the nudge. */
	readonly onDidChangeSnapshot: vscode.Event<Snapshot>;
	/** The user's pick, kept for this workspace from now on. */
	choose(id: string): void;
}

export function createModes(context: vscode.ExtensionContext): Modes {
	const registry = new ModeRegistry();
	const claims = new Map<string, boolean>();
	let active: string | undefined;
	// Mirrored rather than read back: a Memento write is asynchronous.
	let chosen = context.workspaceState.get<string>(CHOSEN_MODE_STATE);
	let lastUsed = context.globalState.get<string>(LAST_MODE_STATE);

	const changedActive = new vscode.EventEmitter<string | undefined>();
	const changedSnapshot = new vscode.EventEmitter<Snapshot>();
	context.subscriptions.push(changedActive, changedSnapshot, new vscode.Disposable(() => clearTimeout(queued)));

	const claimants = () => [...claims].filter(([, claimed]) => claimed).map(([id]) => id);

	function snapshot(): Snapshot {
		const registered = registry.modes();
		const modes = registered.map(({ id, label }) => ({ id, label }));
		const nudged = nudgeFor(
			modes.map((mode) => mode.id),
			active,
			claimants()
		);
		const current = active === undefined ? undefined : registry.get(active);
		return {
			modes,
			active,
			nudge: modes.find((mode) => mode.id === nudged),
			shape: shapeOf(modes.length),
			mode: current && { id: current.id, label: current.label, boardPanel: current.boardPanel },
			menus: registered.map(({ id, label, menuCommands }) => ({
				label,
				active: id === active,
				entries: menuCommands ?? [],
			})),
		};
	}

	/** What the panel would draw differently; the menu's entries are read on a click, not pushed. */
	const drawn = (snapshot: Snapshot) =>
		JSON.stringify([snapshot.modes, snapshot.active, snapshot.nudge?.id, snapshot.shape, snapshot.mode?.boardPanel]);
	let lastDrawn = '';

	/** Runs on every fact that changes, and is the only place the active mode moves. */
	function evaluate(): void {
		const registered = registry.ids();
		const pick = pickMode({ registered, chosen, claimants: claimants(), lastUsed });

		// Kept up to date whether or not the mode moved: a claim arriving for the
		// mode already active is what makes it worth coming back to.
		if (pick && worthRemembering(pick, pending.size > 0) && lastUsed !== pick.id) {
			lastUsed = pick.id;
			remember(context.globalState, LAST_MODE_STATE, pick.id);
		}

		const moved = pick?.id !== active;
		if (moved) {
			active = pick?.id;
			log(pick ? `Mode: ${pick.id} (${pick.because})` : 'Mode: none registered');
		}
		// The header and the board section's title before the keys, so a pane that
		// appears already carries the right words; the API event last. Only when
		// something drawn changed: a claim answered the same is not a repaint.
		const next = snapshot();
		if (drawn(next) !== lastDrawn) {
			lastDrawn = drawn(next);
			changedSnapshot.fire(next);
		}
		applyContext(registered, pick?.id);
		if (moved) changedActive.fire(active);
	}

	/**
	 * All three shapes from one place, so they change together and the panel
	 * never shows two. The active mode is one string key, so a switch is one
	 * context change: the workbench drops the old mode's views and adds the new
	 * one's in the same pass, with no paint between. Two keys would leave the
	 * switcher alone for a frame, merged into the container title.
	 *
	 * The order is the layout. Each `setContext` lands on its own, and a container
	 * with no visible view for even a moment is hidden and the sidebar jumps to the
	 * Explorer, so a shape key turning true goes first and one turning false last.
	 * The board-panel list goes before the mode, so the fallback view's clause is
	 * already right when the mode lands.
	 */
	let lastApplied = '';
	function applyContext(registered: readonly string[], picked: string | undefined): void {
		const boardPanelModes = registered.filter((id) => registry.get(id)?.boardPanel === true);
		// Same facts, same keys: the workbench would ignore the sets, but each is a round trip.
		const applied = JSON.stringify([registered, picked, boardPanelModes]);
		if (applied === lastApplied) return;
		lastApplied = applied;

		const shape = shapeOf(registered.length);
		if (shape === 'none') setContext(NO_MODES_CONTEXT, true);
		if (shape === 'many') setContext(MANY_MODES_CONTEXT, true);
		setContext(BOARD_PANEL_MODES_CONTEXT, boardPanelModes);
		setContext(ACTIVE_MODE_CONTEXT, picked);
		if (shape !== 'none') setContext(NO_MODES_CONTEXT, false);
		if (shape !== 'many') setContext(MANY_MODES_CONTEXT, false);
	}

	function registerMode(candidate: unknown): vscode.Disposable {
		let mode: Mode;
		let unregister: (() => void) | undefined;
		let claimListener: vscode.Disposable | undefined;
		try {
			mode = admit(candidate, API_VERSION);
			unregister = registry.register(mode);
			// Inside the try: a subscribe that throws must not leave the mode registered with nothing returned.
			claimListener = mode.onDidChangeWorkspaceClaim?.(askEveryone);
		} catch (error) {
			unregister?.();
			log(`A mode was refused: ${String(error)}`);
			if (error instanceof IncompatibleApiError) explain(error, context.extension.id);
			throw error;
		}
		log(`Mode registered: ${mode.id} by ${mode.extensionId}, built against API ${mode.apiVersion}`);

		ask(mode);
		evaluate();

		// Runs once: a Disposable drops its callback after the first dispose.
		return new vscode.Disposable(() => {
			unregister?.();
			claims.delete(mode.id);
			// The ask counter stays: an answer in flight for the same object re-registered is still stale.
			pending.delete(mode.id);
			claimListener?.dispose();
			log(`Mode unregistered: ${mode.id}`);
			evaluate();
		});
	}

	// Each ask is numbered, so an answer that arrives after a newer ask is dropped:
	// a claim reads the workspace, and two overlapping reads can finish in either order.
	const asks = new Map<string, number>();
	const pending = new Set<string>();

	/**
	 * One mode noticing a change is the only signal there is that the workspace
	 * moved, and a mode watches its own files, not another's. Deleting the last
	 * `.py` is news to whoever watches `.cpp` too, so everyone answers again.
	 */
	let queued: ReturnType<typeof setTimeout> | undefined;
	function askEveryone(): void {
		// Each file event lands in its own turn, so merging a burst has to wait past one.
		clearTimeout(queued);
		queued = setTimeout(() => {
			queued = undefined;
			for (const mode of registry.modes()) ask(mode);
		}, CLAIM_BURST_MS);
	}

	/** Asked every time, and the answer is only kept while it is the latest and the mode is still the registered one. */
	function ask(mode: Mode): void {
		if (!mode.claimsWorkspace) return;
		const generation = (asks.get(mode.id) ?? 0) + 1;
		asks.set(mode.id, generation);
		pending.add(mode.id);
		// Wrapped so a synchronous throw lands in the same place as a rejection.
		Promise.resolve()
			.then(() => mode.claimsWorkspace?.())
			.then(
				(answer) => settle(mode, generation, answer === true),
				(error: unknown) => {
					log(`${mode.id} could not say whether this is its workspace: ${String(error)}`);
					settle(mode, generation, false);
				}
			);
	}

	function settle(mode: Mode, generation: number, answer: boolean): void {
		if (registry.get(mode.id) !== mode || asks.get(mode.id) !== generation) return;
		pending.delete(mode.id);
		if (claims.get(mode.id) !== answer) {
			claims.set(mode.id, answer);
			log(`${mode.id} ${answer ? 'claims' : 'does not claim'} this workspace`);
		}
		// Even unchanged: the last pending claim settling may make the pick worth remembering.
		evaluate();
	}

	function choose(id: string): void {
		if (!registry.get(id)) {
			log(`Cannot switch to "${id}": it is not registered`);
			return;
		}
		chosen = id;
		remember(context.workspaceState, CHOSEN_MODE_STATE, id);
		evaluate();
	}

	evaluate();

	return {
		registerMode,
		activeMode: () => active,
		onDidChangeActiveMode: changedActive.event,
		snapshot,
		onDidChangeSnapshot: changedSnapshot.event,
		choose,
	};
}

/**
 * The one message a user can act on, which is why it is shown here: this is the
 * only extension holding both versions and both names, so it is the only one
 * that can say which of the two to update.
 */
/** Names the extension to update, the mode by the label it declared, this one by the id the host gave it. */
function explain(refusal: IncompatibleApiError, self: string): void {
	const mode = refusal.label;
	const [message, update] =
		refusal.behind === 'manager'
			? [`${mode} needs a newer version of ${PRODUCT}. Update ${PRODUCT} to use it.`, self]
			: [`${mode} was built for an older ${PRODUCT}. Update ${mode} to use it.`, refusal.extensionId];
	void vscode.window
		.showErrorMessage(`${PRODUCT}: ${message} (it needs API ${refusal.wanted}, this is ${refusal.served})`, 'Show Extension')
		.then((picked) => (picked ? openExtensionPage(update) : undefined))
		.then(undefined, (error: unknown) => log(`Could not show the refusal: ${String(error)}`));
}

function remember(memento: vscode.Memento, key: string, value: string): void {
	void memento.update(key, value).then(undefined, (error: unknown) => log(`Could not store ${key}: ${String(error)}`));
}
