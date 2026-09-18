import type { MenuGroup } from '../../api';
import * as vscode from 'vscode';

import { PRODUCT } from '../config';
import { menuCommands, menuSections, type BoardState, type Contributed, type PaletteEntry } from '../ui/menu';

type Item = vscode.QuickPickItem & { command?: string };

/**
 * What the status bar item opens: this extension's palette entries and every
 * registered group's, in one place a learner can find without knowing the
 * palette exists. Titles come from the manifest, so menu and palette cannot drift.
 */
export async function showMenu(
	context: vscode.ExtensionContext,
	board: BoardState,
	groups: readonly MenuGroup[],
	panelHidden: boolean
): Promise<void> {
	const contributed: Contributed[] = context.extension.packageJSON?.contributes?.commands ?? [];
	const palette: PaletteEntry[] = context.extension.packageJSON?.contributes?.menus?.commandPalette ?? [];
	const entries = menuCommands(contributed, palette, board, groups, panelHidden);

	// Separators name who owns each part, so two languages' "Flash" and ours read apart.
	const items: Item[] = [];
	for (const section of menuSections(entries, groups, contributed)) {
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
