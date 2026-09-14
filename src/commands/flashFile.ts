/**
 * Flash a `.hex` somebody already has. The whole of what this extension does on
 * its own: no project, no build, just a file onto a board.
 */
import type { FlashHex } from '../activate';
import * as vscode from 'vscode';

import { PRODUCT } from '../config';
import { log } from '../log';

export function flashHexFile(flashHex: FlashHex) {
	return async (_context: vscode.ExtensionContext, ...args: unknown[]): Promise<void> => {
		// Asked for whenever it was not given one, which is every way in but the
		// Explorer: a button that sends you off to open a file first is a button that
		// does nothing the one time you press it.
		const file = clicked(args) ?? (await ask());
		// Dismissing the picker is an answer, and needs no message.
		if (!file) return;

		// A file picked a moment ago can be gone, or on a provider that has since
		// dropped out. Unhandled it reaches the user as the host's own error box.
		let hex: Uint8Array;
		try {
			hex = await vscode.workspace.fs.readFile(file);
		} catch (error) {
			log(`Could not read ${file.toString()}: ${String(error)}`);
			void vscode.window.showErrorMessage(`${PRODUCT}: ${name(file)} could not be read, so nothing was sent.`);
			return;
		}

		if (await flashHex(hex)) {
			void vscode.window.showInformationMessage(`${PRODUCT}: flashed ${name(file)} to the micro:bit.`);
		}
	};
}

/** The Explorer passes the clicked resource, which in a multi-root window is the one that matters. */
const clicked = (args: readonly unknown[]): vscode.Uri | undefined =>
	args.find((arg): arg is vscode.Uri => arg instanceof vscode.Uri);

/**
 * One dialog on both hosts: a native panel on the desktop, and VS Code's own
 * quick pick in a browser, which reads a workspace backed by virtual providers.
 */
async function ask(): Promise<vscode.Uri | undefined> {
	// Only where there is one folder to be right about. Opening at the first of
	// several lands somewhere the hex is as likely as not to be, and VS Code's own
	// default is where the user last was.
	const folders = vscode.workspace.workspaceFolders ?? [];
	const picked = await vscode.window.showOpenDialog({
		title: `${PRODUCT}: which hex file?`,
		openLabel: 'Flash',
		canSelectMany: false,
		filters: { 'micro:bit hex': ['hex'] },
		...(folders.length === 1 ? { defaultUri: folders[0]?.uri } : {}),
	});
	return picked?.[0];
}

const name = (file: vscode.Uri) => file.path.split('/').pop() ?? file.toString();
