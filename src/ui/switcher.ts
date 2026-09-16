/**
 * The switcher: a webview view drawing the segmented strip, expanded from the
 * first layout so the switch is in view. The header description names the
 * active mode, so a user who collapses the section, which the workbench then
 * remembers for the workspace, still sees which mode the panel is in.
 */
import * as vscode from 'vscode';

import { PRODUCT, SWITCHER_VIEW_ID } from '../config';
import type { Modes, Snapshot } from '../modes/state';
import type { FromSwitcher, ToSwitcher } from '../webview/protocol';

export function createSwitcher(context: vscode.ExtensionContext, modes: Modes): void {
	let current: vscode.WebviewView | undefined;

	const describe = (view: vscode.WebviewView, snapshot: Snapshot) => {
		view.description = snapshot.nudge
			? `${snapshot.mode?.label} · switch to ${snapshot.nudge.label}?`
			: snapshot.mode?.label;
	};

	const push = (snapshot: Snapshot) => {
		if (!current) return;
		describe(current, snapshot);
		// Built field by field: the document gets the strip's facts and nothing a mode can do.
		const message: ToSwitcher = { type: 'state', modes: snapshot.modes, active: snapshot.active, nudge: snapshot.nudge };
		// A rejection is the view going away mid-post; the next resolve asks again.
		void current.webview.postMessage(message).then(undefined, () => undefined);
	};

	const provider: vscode.WebviewViewProvider = {
		resolveWebviewView(view) {
			current = view;
			view.onDidDispose(() => {
				if (current === view) current = undefined;
			});
			const assets = vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview');
			view.webview.options = { enableScripts: true, localResourceRoots: [assets] };
			view.webview.onDidReceiveMessage((message: FromSwitcher) => {
				// `ready` comes on every load: the document is rebuilt each time the section is expanded.
				if (message?.type === 'ready') push(modes.snapshot());
				else if (message?.type === 'switch' && typeof message.id === 'string') modes.choose(message.id);
			});
			view.webview.html = stripDocument(view.webview, assets);
			describe(view, modes.snapshot());
		},
	};

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(SWITCHER_VIEW_ID, provider),
		modes.onDidChangeSnapshot(push)
	);
}

function stripDocument(webview: vscode.Webview, assets: vscode.Uri): string {
	const nonce = Array.from({ length: 32 }, () => Math.floor(Math.random() * 36).toString(36)).join('');
	const script = webview.asWebviewUri(vscode.Uri.joinPath(assets, 'switcher.js'));
	const style = webview.asWebviewUri(vscode.Uri.joinPath(assets, 'switcher.css'));
	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
<link rel="stylesheet" href="${style.toString()}">
</head>
<body><div id="root"></div><script nonce="${nonce}" src="${script.toString()}"></script></body>
</html>`;
}

/** The Switch Mode command: given a mode id it switches, given nothing it asks. */
export function switchMode(modes: Modes) {
	return async (_context: vscode.ExtensionContext, ...args: unknown[]): Promise<void> => {
		const wanted = typeof args[0] === 'string' ? args[0] : await ask(modes);
		if (wanted) modes.choose(wanted);
	};
}

async function ask(modes: Modes): Promise<string | undefined> {
	const { modes: list, active, shape } = modes.snapshot();
	if (shape !== 'many') {
		void vscode.window.showInformationMessage(
			shape === 'one'
				? `${PRODUCT}: ${list[0]?.label} is the only mode installed, so there is nothing to switch to.`
				: `${PRODUCT}: no mode is installed. Install a micro:bit language extension to get one.`
		);
		return undefined;
	}
	const picked = await vscode.window.showQuickPick(
		list.map((mode) => ({ label: mode.label, description: mode.id === active ? 'active' : undefined, id: mode.id })),
		{ title: `${PRODUCT}: switch mode`, placeHolder: 'Which mode should the micro:bit panel show?' }
	);
	return picked?.id;
}
