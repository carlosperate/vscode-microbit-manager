import { ConnectionStatus, type BoardVersion } from '@microbit/microbit-connection';
import * as vscode from 'vscode';

import { COMMANDS, PRODUCT } from '../config';
import { log } from '../log';
import { createVisibleStatus, describeStatus } from './status';

/** The always-visible entry point for connecting a board. */
export interface StatusBar extends vscode.Disposable {
	update(status: ConnectionStatus, board?: BoardVersion): void;
}

/**
 * Unconditional on both hosts, because there is always something behind it: this
 * extension flashes a hex and opens a serial terminal with nothing else
 * installed. It always opens the menu, whatever it currently reads, since a
 * control that runs a different command depending on its own text is one users
 * learn to distrust.
 */
function createItem(): vscode.StatusBarItem {
	const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
	item.name = PRODUCT;
	item.command = COMMANDS.showMenu;
	item.text = '$(plug) micro:bit';
	item.tooltip = `${PRODUCT}: what to do with a micro:bit`;
	return item;
}

/**
 * Where a board is reached through the drive it mounts there is no connection to
 * report, so the item says what it is for and never changes. Reporting "no
 * micro:bit connected" there would be wrong in front of a board that is plugged
 * in and ready to be flashed.
 */
export function createIdleStatusBar(): vscode.StatusBarItem {
	const item = createItem();
	item.show();
	return item;
}

/** Follows a live connection, so its text names the board once one answers. */
export function createStatusBar(): StatusBar {
	const item = createItem();
	const visibleStatus = createVisibleStatus();

	// Logged here rather than beside the connection, so what a reader sees in the
	// output channel is word for word what the tooltip beside them says.
	const update = (status: ConnectionStatus, board?: BoardVersion) => {
		const { text, tooltip, summary } = describeStatus(visibleStatus(status), board);
		item.text = text;
		item.tooltip = tooltip;
		log(`Board status: ${summary}`);
	};

	update(ConnectionStatus.NoAuthorizedDevice);
	item.show();
	return { update, dispose: () => item.dispose() };
}
