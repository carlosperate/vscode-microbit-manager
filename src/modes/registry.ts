/**
 * Who has registered a mode. Pure: the decisions about which one is active are
 * in `policy.ts`, and the `vscode` around both is in `state.ts`.
 */
import type { Mode } from '../../api';

import { parseSemver, serves, whoIsBehind, type Behind } from './semver';

/** Lowercase and the mode's own, whatever it calls itself. It ends up in a context key. */
const MODE_ID = /^[a-z][a-z0-9-]*$/;

/** `publisher.name`, which is what `vscode.extensions.getExtension` takes. */
const EXTENSION_ID_PATTERN = /^[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9-]*$/i;

/**
 * Thrown by `registerMode` when the versions do not meet. It carries both
 * numbers and both sides, so the message shown can name the extension to update.
 */
export class IncompatibleApiError extends Error {
	constructor(
		readonly extensionId: string,
		/** The mode's own label, so a message can name it without reading its manifest. */
		readonly label: string,
		readonly wanted: string,
		readonly served: string,
		readonly behind: Behind
	) {
		super(
			`${extensionId} needs the micro:bit Manager API ${wanted}, and this extension serves ${served}. ` +
				`Update the ${behind === 'manager' ? 'manager extension' : 'mode'}.`
		);
		this.name = 'IncompatibleApiError';
	}
}

/**
 * Why `candidate` is not a `Mode`, or nothing when it is one. Checked rather
 * than trusted because it comes from another extension, and a shape error there
 * would otherwise surface as a throw deep inside this one, blamed on it.
 */
export function describeInvalid(candidate: unknown): string | undefined {
	if (typeof candidate !== 'object' || candidate === null) return `a mode must be an object, not ${typeof candidate}`;
	const mode = candidate as Record<string, unknown>;

	if (typeof mode.id !== 'string' || !MODE_ID.test(mode.id)) {
		return '`id` must be a lowercase word: a letter, then letters, digits or dashes';
	}
	if (typeof mode.extensionId !== 'string' || !EXTENSION_ID_PATTERN.test(mode.extensionId)) {
		return '`extensionId` must be the extension\'s own "publisher.name"';
	}
	if (typeof mode.label !== 'string' || mode.label.trim() === '') return '`label` must be a non-empty string';
	if (!parseSemver(mode.apiVersion)) return '`apiVersion` must be a version such as "1.0.0"';
	if (mode.claimsWorkspace !== undefined && typeof mode.claimsWorkspace !== 'function') {
		return '`claimsWorkspace` must be a function when given';
	}
	if (mode.onDidChangeWorkspaceClaim !== undefined && typeof mode.onDidChangeWorkspaceClaim !== 'function') {
		return '`onDidChangeWorkspaceClaim` must be an event when given';
	}
	if (mode.menuCommands !== undefined && !isMenu(mode.menuCommands)) {
		return '`menuCommands` must be a list of { command, label } when given';
	}
	if (mode.boardPanel !== undefined && typeof mode.boardPanel !== 'boolean') {
		return '`boardPanel` must be true or false when given';
	}
	return undefined;
}

const isMenu = (value: unknown): boolean =>
	Array.isArray(value) &&
	value.every(
		(entry: unknown) =>
			typeof entry === 'object' &&
			entry !== null &&
			typeof (entry as { command?: unknown }).command === 'string' &&
			typeof (entry as { label?: unknown }).label === 'string'
	);

/**
 * The candidate as a `Mode`, or a throw saying why not: a `TypeError` for a
 * shape this extension cannot use, `IncompatibleApiError` for a version it
 * cannot serve. `served` is the API version this extension provides.
 */
export function admit(candidate: unknown, served: string): Mode {
	const wrong = describeInvalid(candidate);
	if (wrong) throw new TypeError(`registerMode: ${wrong}`);
	const mode = candidate as Mode;

	const wanted = parseSemver(mode.apiVersion);
	const ours = parseSemver(served);
	if (!wanted || !ours) throw new TypeError(`registerMode: cannot compare ${mode.apiVersion} with ${served}`);
	if (!serves(ours, wanted)) {
		throw new IncompatibleApiError(mode.extensionId, mode.label, mode.apiVersion, served, whoIsBehind(ours, wanted));
	}
	return mode;
}

export class ModeRegistry {
	private readonly entries = new Map<string, Mode>();

	/** The undo, which is safe to call twice. A second mode with the same id is refused, not replaced. */
	register(mode: Mode): () => void {
		const taken = this.entries.get(mode.id);
		if (taken) {
			throw new Error(`registerMode: a mode with id "${mode.id}" is already registered, by ${taken.extensionId}`);
		}
		this.entries.set(mode.id, mode);
		return () => {
			if (this.entries.get(mode.id) === mode) this.entries.delete(mode.id);
		};
	}

	get(id: string): Mode | undefined {
		return this.entries.get(id);
	}

	/** Sorted by id in code unit order, which is the one order that is the same on every machine. */
	modes(): Mode[] {
		return [...this.entries.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
	}

	ids(): string[] {
		return this.modes().map((mode) => mode.id);
	}
}
