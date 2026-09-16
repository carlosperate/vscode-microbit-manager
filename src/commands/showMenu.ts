import * as vscode from 'vscode';

import { PRODUCT } from '../config';
import {
	menuCommands,
	menuSections,
	type ActiveModeMenu,
	type BoardState,
	type Contributed,
	type PaletteEntry,
} from '../ui/menu';

type Item = vscode.QuickPickItem & { command?: string };

/**
 * What the status bar item opens: this extension's palette entries and the
 * active mode's own, in one place a learner can find without knowing the palette
 * exists. The titles come from the manifest at runtime, so the menu and the
 * palette cannot drift as commands are added. What holds the board decides
 * which of Connect and Disconnect are worth offering.
 */
export async function showMenu(
	context: vscode.ExtensionContext,
	board: BoardState,
	mode: ActiveModeMenu | undefined,
	canSwitch: boolean
): Promise<void> {
	const contributed: Contributed[] = context.extension.packageJSON?.contributes?.commands ?? [];
	const palette: PaletteEntry[] = context.extension.packageJSON?.contributes?.menus?.commandPalette ?? [];
	const entries = menuCommands(contributed, palette, board, mode?.entries ?? [], canSwitch);

	// Separators name who owns each group, so "Flash" and "Flash hex to micro:bit" read apart.
	const items: Item[] = [];
	for (const section of menuSections(entries, mode)) {
		if (section.label) items.push({ label: section.label, kind: vscode.QuickPickItemKind.Separator });
		for (const entry of section.entries) items.push({ label: entry.title, command: entry.command });
	}

	const picked = await vscode.window.showQuickPick(items, {
		title: PRODUCT,
		placeHolder: 'What would you like to do with the micro:bit?',
	});
	if (!picked?.command) return;

	await vscode.commands.executeCommand(picked.command);
}
