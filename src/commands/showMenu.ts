import * as vscode from 'vscode';

import { PRODUCT } from '../config';
import { menuCommands, type BoardState, type Contributed, type PaletteEntry } from '../ui/menu';

/**
 * What the status bar item opens: this extension's palette entries, in one place
 * a learner can find without knowing the palette exists. The titles come from
 * the manifest at runtime, so the menu and the palette cannot drift as commands
 * are added. What holds the board decides which of Connect and Disconnect are
 * worth offering.
 */
export async function showMenu(context: vscode.ExtensionContext, board: BoardState): Promise<void> {
	const contributed: Contributed[] = context.extension.packageJSON?.contributes?.commands ?? [];
	const palette: PaletteEntry[] = context.extension.packageJSON?.contributes?.menus?.commandPalette ?? [];
	const entries = menuCommands(contributed, palette, board);

	const picked = await vscode.window.showQuickPick(
		entries.map((entry) => ({ label: entry.title, command: entry.command })),
		{ title: PRODUCT, placeHolder: 'What would you like to do with the micro:bit?' }
	);
	if (!picked) return;

	await vscode.commands.executeCommand(picked.command);
}
