import * as vscode from 'vscode';

import { CONTAINER_ID, FALLBACK_VIEW_ID } from '../config';
import type { Modes, Snapshot } from '../modes/state';

/**
 * The fallback panel is welcome content alone, written in the manifest. VS Code
 * shows it only over a tree that has a provider and no children; with no
 * provider the view says so instead, and the content never appears. Serving as
 * a mode's board section, it takes that mode's name, so the section says which
 * mode is active even with the switcher collapsed.
 */
export function createFallbackView(context: vscode.ExtensionContext, modes: Modes): void {
	const view = vscode.window.createTreeView<vscode.TreeItem>(FALLBACK_VIEW_ID, {
		treeDataProvider: {
			getChildren: () => [],
			getTreeItem: (item) => item,
		},
	});
	const own = manifestName(context);
	// Only when it is about to show: retitling a section on its way out would flip its header first.
	const retitle = ({ shape, mode }: Snapshot) => {
		if (shape !== 'none' && !mode?.boardPanel) return;
		const title = mode?.label ?? own;
		if (view.title !== title) view.title = title;
	};
	retitle(modes.snapshot());
	context.subscriptions.push(view, modes.onDidChangeSnapshot(retitle));
}

/** The view's name as the manifest gives it, so the code restores what the user first saw. */
function manifestName(context: vscode.ExtensionContext): string {
	const views: { id?: string; name?: string }[] = context.extension.packageJSON?.contributes?.views?.[CONTAINER_ID] ?? [];
	return views.find((view) => view.id === FALLBACK_VIEW_ID)?.name ?? 'Board';
}
