/**
 * A second mode, since no real one exists to test the switcher against. Plain
 * CommonJS with no build step, loaded by both hosts from this folder. It draws
 * nothing of its own: it asks the manager for its board section, which is what a
 * mode with no buttons of its own does.
 */
const vscode = require('vscode');

const MANAGER = 'carlosperate.bbcmicrobit-manager';

async function activate(context) {
	const manager = vscode.extensions.getExtension(MANAGER);
	const api = manager && (manager.isActive ? manager.exports : await manager.activate());
	const settings = () => vscode.workspace.getConfiguration('fake-mode');
	const claimChanged = new vscode.EventEmitter();
	context.subscriptions.push(claimChanged);

	// Reported through the exports, which is how the integration tests read it.
	const status = { registered: false, error: undefined };
	let registration;

	function register() {
		if (!api) {
			status.error = `${MANAGER} is not installed`;
			return;
		}
		try {
			registration = api.registerMode({
				apiVersion: settings().get('apiVersion', '0.1.0'),
				id: 'fake',
				extensionId: 'bbcmicrobit-test.fake-mode',
				label: settings().get('label', 'Fake'),
				claimsWorkspace: async () => settings().get('claims', false),
				onDidChangeWorkspaceClaim: claimChanged.event,
				menuCommands: [{ command: 'fake-mode.flash', label: 'Flash (fake)' }],
				boardPanel: true,
			});
			status.registered = true;
		} catch (error) {
			// The manager has already explained a refusal.
			status.error = String(error);
		}
	}

	function unregister() {
		registration?.dispose();
		registration = undefined;
		status.registered = false;
	}

	register();

	context.subscriptions.push(
		{ dispose: unregister },
		vscode.workspace.onDidChangeConfiguration((event) => {
			if (event.affectsConfiguration('fake-mode.claims')) claimChanged.fire();
		}),
		// The bench's way to take a mode away and bring it back without a reload.
		vscode.commands.registerCommand('fake-mode.toggle', () => {
			if (registration) unregister();
			else register();
			vscode.window.setStatusBarMessage(`Fake Mode: ${registration ? 'registered' : 'unregistered'}`, 3000);
		}),
		// What a real Flash does: ask which board, build for it, hand the bytes over.
		vscode.commands.registerCommand('fake-mode.flash', async () => {
			if (!api) return;
			const board = await api.connect();
			if (!board) return;
			await api.flashHex(':00000001FF\n', { expect: board });
		})
	);

	return status;
}

module.exports = { activate, deactivate() {} };
