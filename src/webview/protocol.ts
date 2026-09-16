/**
 * What crosses between the extension host and the strip's document. Pure, so
 * both tsconfig projects compile it: the host has no DOM and the document has
 * no `vscode`.
 */

/** One segment of the strip. */
export interface Segment {
	readonly id: string;
	readonly label: string;
}

/** The whole picture on every change, so the document keeps no state of its own. */
export interface SwitcherState {
	readonly modes: readonly Segment[];
	readonly active: string | undefined;
	/** The mode that claims this workspace while another is active. */
	readonly nudge: Segment | undefined;
}

export type ToSwitcher = { readonly type: 'state' } & SwitcherState;

export type FromSwitcher = { readonly type: 'ready' } | { readonly type: 'switch'; readonly id: string };
