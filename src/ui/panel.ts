import * as vscode from 'vscode';

import { BOARD_VIEW_ID, OFFERS } from '../config';
import { setContext } from '../context';

/**
 * The panel is welcome content alone, written in the manifest. VS Code shows it
 * only over a tree that has a provider and no children; with no provider the
 * view says so instead, and the content never appears.
 */
export function createPanel(context: vscode.ExtensionContext): void {
	context.subscriptions.push(
		vscode.window.registerTreeDataProvider<vscode.TreeItem>(BOARD_VIEW_ID, {
			getChildren: () => [],
			getTreeItem: (item) => item,
		})
	);

	// `getExtension` finds enabled extensions only, so a disabled one is offered too, and its page enables it.
	const offer = () => {
		for (const { extension, context: key } of OFFERS) setContext(key, !vscode.extensions.getExtension(extension));
	};
	offer();
	context.subscriptions.push(vscode.extensions.onDidChange(offer));
}
