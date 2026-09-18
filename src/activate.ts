/**
 * Everything both entry points do the same way. The two hosts reach a board by
 * unrelated means, so the commands are the seam and everything else sits above.
 */
import type { BoardInfo, HexSource, MicrobitManagerApi } from '../api';
import * as vscode from 'vscode';

import { createApi } from './api';
import { flashHexFile } from './commands/flashFile';
import { showMenu } from './commands/showMenu';
import { createLayoutCommands } from './commands/layout';
import { COMMANDS, PRODUCT, type CommandId } from './config';
import { createLog, log } from './log';
import { MenuGroups } from './menuGroups';
import { createSerialMonitor } from './serial/eclipse';
import { createPanel } from './ui/panel';
import type { BoardState } from './ui/menu';

export type CommandHandler = (context: vscode.ExtensionContext, ...args: unknown[]) => Promise<void>;

export type FlashHex = (hex: HexSource, options?: { expect?: BoardInfo }) => Promise<boolean>;

/** What only a host can do with a board, which is everything the API is about. */
export interface BoardAccess {
	connect(): Promise<BoardInfo | undefined>;
	board(): BoardInfo | undefined;
	flashHex: FlashHex;
}

export type Entry = 'browser' | 'node';

/** What one entry point supplies, over the shared wiring below. */
export interface Host {
	entry: Entry;
	commands: Partial<Record<CommandId, CommandHandler>>;
	/** Runs once the output channel exists. */
	start?(context: vscode.ExtensionContext): void;
	/** Absent where nothing can be paired, which drops both menu entries. */
	boardState?(): BoardState;
	/** How this host reaches a board, which is what the exported API is built from. */
	access: BoardAccess;
}

export function activateHost(context: vscode.ExtensionContext, host: Host): MicrobitManagerApi {
	createLog(context);
	log(`Extension activated, ${host.entry} entry`);

	createSerialMonitor(context);
	createPanel(context);
	// The status bar item belongs to whichever host built it: on web it tracks a
	// live connection, so it is created with one rather than beside it.
	host.start?.(context);

	// One object for the command and for the API, so a language extension and a
	// button cannot start two flashes between them.
	const access: BoardAccess = { ...host.access, flashHex: oneAtATime(host.access.flashHex) };
	const groups = new MenuGroups();
	const layout = createLayoutCommands(context, groups);

	const implemented: Partial<Record<CommandId, CommandHandler>> = {
		...host.commands,
		// Read on every opening, so a group registered after activation is there.
		[COMMANDS.showMenu]: (forMenu) =>
			showMenu(forMenu, host.boardState?.() ?? 'unpairable', groups.list(), layout.panelHidden()),
		// Shared, because the only host-specific part of it is the write at the end.
		[COMMANDS.flashHexFile]: flashHexFile(access.flashHex),
		[COMMANDS.combineSidebars]: layout.combine,
		[COMMANDS.separateSidebars]: layout.separate,
		[COMMANDS.hidePanel]: layout.hidePanel,
		[COMMANDS.showPanel]: layout.showPanel,
	};

	// Manifest titles keep stub notifications in sync with the command palette.
	const titles = contributedTitles(context);
	for (const id of Object.values(COMMANDS)) {
		const implementation = implemented[id];
		context.subscriptions.push(
			// Whatever a caller passes is forwarded intact, rather than dropped here.
			vscode.commands.registerCommand(id, async (...args: unknown[]) => {
				log(`Running ${id}`);
				try {
					if (implementation) return await implementation(context, ...args);
					void vscode.window.showInformationMessage(
						`${PRODUCT}: ${titles.get(id) ?? id} is not implemented yet.`
					);
				} catch (error) {
					// Rethrown: anything reaching here is a defect, and should stay loud.
					log(`${id} failed: ${String(error)}`);
					throw error;
				}
			})
		);
	}

	return createApi(access, groups);
}

/**
 * One flash at a time, whoever asked: the button, the Explorer, or a language
 * extension through the API. Both hosts take a board away for the length of
 * one, and neither can be started again part way through, so the rule and the
 * sentence that explains it live here rather than once per host.
 */
function oneAtATime(flashHex: FlashHex): FlashHex {
	let flashing: Promise<boolean> | undefined;
	return (hex, options) => {
		// Set before anything is awaited, or a double click gets past it.
		if (flashing) {
			void vscode.window.showInformationMessage(
				`${PRODUCT}: the micro:bit is still being programmed. Wait for that to finish before flashing again.`
			);
			return Promise.resolve(false);
		}
		flashing = flashHex(hex, options).finally(() => {
			flashing = undefined;
		});
		return flashing;
	};
}

function contributedTitles(context: vscode.ExtensionContext): Map<string, string> {
	const contributed: { command: string; title: string }[] =
		context.extension.packageJSON?.contributes?.commands ?? [];
	return new Map(contributed.map((entry) => [entry.command, entry.title]));
}
