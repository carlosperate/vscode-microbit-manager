import * as vscode from 'vscode';

import { CAN_PAIR_CONTEXT, COMMANDS, CONTAINER_ID, FALLBACK_VIEW_ID, PRODUCT } from '../../src/config';
import { API_VERSION } from '../../src/api';

/**
 * The integration tests: one bundle on two hosts, `@vscode/test-web` and
 * `@vscode/test-electron`, for what a stubbed `vscode` cannot see. Every check
 * reports before it asserts, so a failing run names the assumption that broke
 * rather than stopping at the first one.
 */
const EXTENSION_ID = 'carlosperate.bbcmicrobit-manager';

interface Result {
	name: string;
	ok: boolean;
	detail: string;
}
const results: Result[] = [];

function record(name: string, ok: boolean, detail: string): void {
	results.push({ name, ok, detail });
	console.log(`[test] ${ok ? 'PASS' : 'FAIL'}  ${name}\n[test]       ${detail}`);
}

export async function run(): Promise<void> {
	const extension = vscode.extensions.getExtension(EXTENSION_ID);
	if (!extension) {
		throw new Error(
			`${EXTENSION_ID} is not loaded. --extensionTestsPath must point inside ` +
				'--extensionDevelopmentPath, or the script runs in a host this extension does not exist in.'
		);
	}

	const api = await checkActivation(extension);
	checkTheExportedObjectIsTheContract(api);
	checkTheContainerIsContributed(extension);
	checkTheFallbackViewLivesInTheContainer(extension);
	await checkTheWorkbenchAcceptedTheContributions();
	checkTheWelcomeContentPointsAtRealCommands(extension);
	checkEveryCommandSaysWhoOwnsIt(extension);
	await checkContributedCommandsResolve(extension);
	await checkPairingIsHiddenWhereItCannotHappen(extension);
	await checkTheStubsAnswerRatherThanThrow();

	summarise();
}

/**
 * A throw inside `activate()` would otherwise reject out of `run()` with no
 * report at all, which is the diagnosis-free failure every check here exists to
 * avoid. The checks below it read the manifest or run commands, so they still
 * say something useful about an extension that failed to come up.
 */
async function checkActivation(extension: vscode.Extension<unknown>): Promise<unknown> {
	try {
		const api: unknown = await extension.activate();
		record('the extension activates', extension.isActive, `isActive=${extension.isActive}, host=${describeHost()}`);
		return api;
	} catch (error) {
		record('the extension activates', false, `activate() threw on ${describeHost()}: ${String(error)}`);
		return undefined;
	}
}

/**
 * Which host this is, from what exists rather than from a platform flag. On the
 * desktop this script runs in the Node host, where reading `navigator` is a
 * ReferenceError rather than an absent WebUSB, so the guard is `typeof`.
 */
function describeHost(): string {
	return typeof navigator === 'undefined' ? 'node' : 'browser';
}

/**
 * The exported object against the published types. It is the one thing a mode
 * sees, and nothing else in either repository would notice the two drifting
 * apart: `api/index.d.ts` is erased at compile time by design.
 */
function checkTheExportedObjectIsTheContract(api: unknown): void {
	const name = 'the exported object is what api/ declares';
	if (typeof api !== 'object' || api === null) {
		record(name, false, `activate() returned ${typeof api}`);
		return;
	}

	const keys = Object.keys(api).sort();
	const version: unknown = (api as { version?: unknown }).version;
	const semver = typeof version === 'string' && /^\d+\.\d+\.\d+$/.test(version);
	record(
		name,
		keys.join() === 'version' && semver && version === API_VERSION,
		`keys=[${keys.join(', ')}], version=${String(version)}, expected ${API_VERSION}`
	);
}

/**
 * A container id that does not resolve sends every view registered against it to
 * the Explorer, with a line in the log and nothing visible to explain it. This
 * is the extension that declares it, so every other micro:bit extension inherits
 * whatever is wrong here.
 */
function checkTheContainerIsContributed(extension: vscode.Extension<unknown>): void {
	const containers: { id: string; title: string }[] =
		extension.packageJSON?.contributes?.viewsContainers?.activitybar ?? [];
	const container = containers.find((entry) => entry.id === CONTAINER_ID);
	record(
		'the shared container is contributed',
		container?.title === 'BBC micro:bit' && !CONTAINER_ID.includes('.'),
		`declared ${containers.map((entry) => entry.id).join(', ') || 'nothing'}, title=${String(container?.title)}`
	);
}

/**
 * The manifest checks either side of this one read JSON. This one asks the
 * workbench, which registers a `.focus` command per view and one per container
 * only once it has accepted them, so a contribution that was rejected or
 * relocated to the Explorer is visible here and nowhere else in the suite.
 */
async function checkTheWorkbenchAcceptedTheContributions(): Promise<void> {
	const registered = await vscode.commands.getCommands(true);
	const expected = [`workbench.view.extension.${CONTAINER_ID}`, `${FALLBACK_VIEW_ID}.focus`];
	const missing = expected.filter((command) => !registered.includes(command));
	record(
		'the workbench registered the container and the view',
		missing.length === 0,
		missing.length ? `missing: ${missing.join(', ')}` : expected.join(', ')
	);
}

function checkTheFallbackViewLivesInTheContainer(extension: vscode.Extension<unknown>): void {
	const views: { id: string }[] = extension.packageJSON?.contributes?.views?.[CONTAINER_ID] ?? [];
	record(
		'the fallback view is inside the container',
		views.some((view) => view.id === FALLBACK_VIEW_ID),
		`${CONTAINER_ID} holds ${views.map((view) => view.id).join(', ') || 'nothing'}`
	);
}

/**
 * Welcome content is markdown, so its command links are strings the workbench
 * resolves only when a user clicks one. A typo is a button that silently does
 * nothing, which no other check here would see.
 */
function checkTheWelcomeContentPointsAtRealCommands(extension: vscode.Extension<unknown>): void {
	const welcome: { view: string; contents: string }[] = extension.packageJSON?.contributes?.viewsWelcome ?? [];
	const contents = welcome
		.filter((entry) => entry.view === FALLBACK_VIEW_ID)
		.map((entry) => entry.contents)
		.join('\n');
	const linked = [...contents.matchAll(/\(command:([^)?]+)/g)].map((match) => match[1]);
	const known: string[] = Object.values(COMMANDS);
	const unknown = linked.filter((command) => !known.includes(command ?? ''));
	record(
		'the fallback panel links commands that exist',
		linked.length > 0 && unknown.length === 0,
		`links ${linked.join(', ') || 'nothing'}${unknown.length ? `, unknown: ${unknown.join(', ')}` : ''}`
	);
}

/**
 * A palette entry with no category reads as a bare verb among every other
 * extension's, and a micro:bit is programmed in more than one language.
 */
function checkEveryCommandSaysWhoOwnsIt(extension: vscode.Extension<unknown>): void {
	const contributed: { command: string; category?: string }[] = extension.packageJSON?.contributes?.commands ?? [];
	const wrong = contributed.filter((entry) => entry.category !== PRODUCT);
	record(
		'every command is categorised under the product name',
		contributed.length > 0 && wrong.length === 0,
		`${contributed.length} commands, ${wrong.length ? `uncategorised: ${wrong.map((e) => e.command).join(', ')}` : `all "${PRODUCT}"`}`
	);
}

/** Every contributed command must resolve, including the ones with no implementation yet. */
async function checkContributedCommandsResolve(extension: vscode.Extension<unknown>): Promise<void> {
	const contributed: { command: string }[] = extension.packageJSON?.contributes?.commands ?? [];
	const registered = await vscode.commands.getCommands(true);
	const missing = contributed.map((entry) => entry.command).filter((command) => !registered.includes(command));
	record(
		'every contributed command is registered',
		missing.length === 0,
		missing.length ? `missing: ${missing.join(', ')}` : `${contributed.length} commands resolve`
	);
}

/**
 * The whole design rests on one fact: the workbench bridges the device chooser
 * on web and not in the Node host. Everything else here follows from it, so it
 * is asserted per host rather than reported. A context key's effective value
 * cannot be read back through the API, so what the `when` clause then does with
 * it is the manual check's to confirm by reading the palette.
 */
async function checkPairingIsHiddenWhereItCannotHappen(extension: vscode.Extension<unknown>): Promise<void> {
	const registered = await vscode.commands.getCommands(true);
	const bridged = registered.includes('workbench.experimental.requestUsbDevice');
	const web = describeHost() === 'browser';
	record(
		'the device chooser bridge is present exactly where it can be',
		bridged === web,
		`${describeHost()} ${bridged ? 'has' : 'has no'} bridge, expected ${web ? 'one' : 'none'}`
	);

	const palette: { command: string; when?: string }[] =
		extension.packageJSON?.contributes?.menus?.commandPalette ?? [];
	const gated = palette.filter((entry) => entry.when === CAN_PAIR_CONTEXT).map((entry) => entry.command);

	// The clause names the key this extension sets, and both pairing commands carry it.
	const expected = [COMMANDS.connect, COMMANDS.disconnect];
	record(
		'pairing is gated on the bridge rather than on the host',
		expected.every((command) => gated.includes(command)),
		`gated on ${CAN_PAIR_CONTEXT}: ${gated.join(', ') || 'nothing'}`
	);

	// Hidden or not, both must resolve: a command contributed and unregistered is an error box.
	const missing = expected.filter((command) => !registered.includes(command));
	record(
		'both pairing commands resolve on this host',
		missing.length === 0,
		missing.length ? `missing: ${missing.join(', ')}` : expected.join(', ')
	);
}

/**
 * A command with no implementation answers with a notification. Running one has
 * to be a no-op a user can recover from, not a rejected promise that the host
 * reports as an extension error.
 */
async function checkTheStubsAnswerRatherThanThrow(): Promise<void> {
	const name = 'an unimplemented command declines rather than throwing';
	try {
		await vscode.commands.executeCommand(COMMANDS.flashHexFile);
		record(name, true, `${COMMANDS.flashHexFile} returned`);
	} catch (error) {
		record(name, false, `${COMMANDS.flashHexFile} threw: ${String(error)}`);
	}
}

function summarise(): void {
	console.log('\n[test] ==== summary ====');
	for (const { name, ok, detail } of results) {
		console.log(`[test] ${ok ? 'PASS' : 'FAIL'}  ${name}`);
		console.log(`[test]       ${detail}`);
	}
	const failed = results.filter((result) => !result.ok);
	if (failed.length) throw new Error(`failed: ${failed.map((result) => result.name).join('; ')}`);
	console.log('[test] ALL PASSED');
}
