import type { MenuGroup, MicrobitManagerApi } from '../../api';
import * as vscode from 'vscode';

import manifest from '../../package.json';
import {
	API_VERSION,
	BOARD_VIEW_ID,
	CAN_PAIR_CONTEXT,
	COMMANDS,
	CONTAINER_ID,
	PRODUCT,
	SERIAL_MONITOR_EXTENSION,
} from '../../src/config';

/** The id the host gives this extension, from the manifest rather than a copy of it. */
const EXTENSION_ID = `${manifest.publisher}.${manifest.name}`;

/**
 * The integration tests: one bundle on two hosts, `@vscode/test-web` and
 * `@vscode/test-electron`, for what a stubbed `vscode` cannot see. Every check
 * reports before it asserts, so a failing run names the assumption that broke
 * rather than stopping at the first one.
 */

/** The stand-in language extension the harness loads from `test/fixtures/fake-language`. */
const FAKE_LANGUAGE_ID = 'bbcmicrobit-test.fake-language';

/** What the fixture returns from `activate()`. */
interface FakeLanguageStatus {
	registered: boolean;
	error: string | undefined;
}

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

/** Nothing here waits on a person, so a run that stops has reached a prompt it cannot answer. */
const PATIENCE_SECONDS = 120;

/**
 * Bounded, and the report is written either way. A command that opens a picker
 * or a modal stops a headless run dead with nothing on screen and no output, and
 * the run has to fail saying so rather than hang until something kills it.
 */
export async function run(): Promise<void> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const stalled = new Promise<string>((resolve) => {
		timer = setTimeout(
			() => resolve(`nothing for ${PATIENCE_SECONDS}s, so a check is waiting on something only a person can do`),
			PATIENCE_SECONDS * 1000
		);
	});

	try {
		const stall = await Promise.race([checks().then(() => undefined), stalled]);
		if (stall) record('every check answers without a person', false, stall);
	} catch (error) {
		// Recorded rather than thrown, so the checks that did run are still reported,
		// and cleared either way: a pending timer holds the host open after the run.
		record('the checks run at all', false, String(error));
	} finally {
		clearTimeout(timer);
	}

	summarise();
}

async function checks(): Promise<void> {
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
	await checkTheWorkbenchAcceptedTheContributions();
	await checkTheWelcomeContentPointsAtRealCommands(extension);
	checkEveryCommandSaysWhoOwnsIt(extension);
	await checkContributedCommandsResolve(extension);
	await checkPairingIsHiddenWhereItCannotHappen(extension);
	await checkTheSerialCompanionIsOfferedNotRequired(extension);
	checkAHexFileOffersTheFlash(extension);

	if (!isApi(api)) return;
	await checkTheFakeLanguageRegistered();
	checkAMenuGroupRegistersAndIsGuarded(api);
	await checkTheLayoutCommandsRun();
}

const isApi = (api: unknown): api is MicrobitManagerApi =>
	typeof api === 'object' && api !== null && typeof (api as { registerMenuGroup?: unknown }).registerMenuGroup === 'function';

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
 * The exported object against the published types. It is the one thing a
 * language extension sees, and nothing else in either repository would notice
 * the two drifting apart: `api/index.d.ts` is erased at compile time by design.
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

	// Exactly these, in both directions: a member the types promise and the object
	// lacks is a caller reaching undefined, and one the object has and the types do
	// not is a caller using something nothing guarantees will still be there.
	const declared = ['board', 'commands', 'connect', 'flashHex', 'registerMenuGroup', 'saveHex', 'version'];
	const callable = ['board', 'connect', 'flashHex', 'registerMenuGroup', 'saveHex'].filter(
		(member) => typeof (api as Record<string, unknown>)[member] !== 'function'
	);
	const commands = (api as { commands?: Record<string, unknown> }).commands ?? {};
	const ids = Object.keys(commands).sort();

	record(
		name,
		keys.join() === declared.join() &&
			callable.length === 0 &&
			semver &&
			version === API_VERSION &&
			ids.join() === 'connect,disconnect,flashHexFile,openTerminal,showMenu',
		`keys=[${keys.join(', ')}], commands=[${ids.join(', ')}], version=${String(version)}` +
			`${callable.length ? `, not functions: ${callable.join(', ')}` : ''}`
	);
}

/**
 * A container id that does not resolve sends every view registered against it to
 * the Explorer, with a line in the log and nothing visible to explain it. Its
 * title is the product name, so the activity bar tooltip says whose icon it is.
 */
function checkTheContainerIsContributed(extension: vscode.Extension<unknown>): void {
	const containers: { id: string; title: string }[] =
		extension.packageJSON?.contributes?.viewsContainers?.activitybar ?? [];
	const container = containers.find((entry) => entry.id === CONTAINER_ID);
	record(
		'the container is contributed under the product name',
		container?.title === PRODUCT && !CONTAINER_ID.includes('.'),
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
	const expected = [`workbench.view.extension.${CONTAINER_ID}`, `${BOARD_VIEW_ID}.focus`];
	const missing = expected.filter((command) => !registered.includes(command));
	record(
		'the workbench registered the container and the view',
		missing.length === 0,
		missing.length ? `missing: ${missing.join(', ')}` : expected.join(', ')
	);
}

/**
 * Welcome content is markdown, so its command links are strings the workbench
 * resolves only when a user clicks one. A typo is a button that silently does
 * nothing, which no other check here would see. Checked against what the
 * workbench registered, since the install link is one of its own commands.
 */
async function checkTheWelcomeContentPointsAtRealCommands(extension: vscode.Extension<unknown>): Promise<void> {
	const welcome: { view: string; contents: string }[] = extension.packageJSON?.contributes?.viewsWelcome ?? [];
	const contents = welcome
		.filter((entry) => entry.view === BOARD_VIEW_ID)
		.map((entry) => entry.contents)
		.join('\n');
	const linked = [...contents.matchAll(/\(command:([^)?]+)/g)].map((match) => match[1] ?? '');
	// Our own commands, plus the workbench's page opener for the install links: a
	// link to any other extension's command would run in a bench and fail for a user.
	const known = new Set<string>([...Object.values(COMMANDS), 'extension.open']);
	const registered = await vscode.commands.getCommands(true);
	const unknown = linked.filter((command) => !known.has(command) || !registered.includes(command));
	record(
		'the panel links commands that exist',
		linked.length > 0 && unknown.length === 0,
		`links ${linked.join(', ') || 'nothing'}${unknown.length ? `, unknown: ${unknown.join(', ')}` : ''}`
	);

	// The one place other extensions are named in this repository: the install
	// links, each opening a page rather than installing in silence.
	const installs = [...contents.matchAll(/\(command:extension\.open\?([^)]+)\)/g)].map((match) => {
		try {
			return (JSON.parse(decodeURIComponent(match[1] ?? '')) as string[])[0];
		} catch {
			return undefined;
		}
	});
	record(
		'every install link carries an extension id the way extension.open expects',
		installs.length > 0 && installs.every((id) => typeof id === 'string' && /^[\w-]+\.[\w-]+$/.test(id)),
		installs.length > 0 ? `extension.open(${installs.map(String).join('), extension.open(')})` : 'no extension.open link'
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
 * The serial terminal belongs to a companion extension, offered as a pack member
 * and never required: a dependency would make VS Code refuse to uninstall it,
 * trading a good message for a blocked action. Running the command without it
 * has to explain itself rather than throw, which is the half a user meets.
 */
async function checkTheSerialCompanionIsOfferedNotRequired(extension: vscode.Extension<unknown>): Promise<void> {
	const pack: string[] = extension.packageJSON?.extensionPack ?? [];
	const dependencies: string[] = extension.packageJSON?.extensionDependencies ?? [];
	record(
		'the serial companion is packed, not depended on',
		pack.includes(SERIAL_MONITOR_EXTENSION) && !dependencies.includes(SERIAL_MONITOR_EXTENSION),
		`pack: ${pack.join(', ') || 'nothing'}; dependencies: ${dependencies.join(', ') || 'none'}`
	);

	const installed = vscode.extensions.getExtension(SERIAL_MONITOR_EXTENSION) !== undefined;
	// Only in the Node host. On web the route reaches for the WebUSB port first,
	// so running it opens a device chooser rather than meeting the companion, and
	// leaves a connect in flight for every check after this one.
	if (describeHost() === 'browser') {
		record(
			'the serial terminal answers rather than throwing',
			true,
			'skipped on web, where the route asks for a board before it asks for the companion'
		);
		return;
	}

	// Never awaited to completion: without the companion this ends at an error
	// notification carrying an action, and an error notification waits for a click
	// that a headless run will never make. What is being asserted is that it does
	// not reject, so a pause long enough to see a rejection is the whole check.
	const outcome = await Promise.race([
		vscode.commands.executeCommand(COMMANDS.openTerminal).then(
			() => 'returned',
			(error: unknown) => `rejected: ${String(error)}`
		),
		new Promise<string>((resolve) => setTimeout(() => resolve('still offering its answer'), 3000)),
	]);
	record(
		'the serial terminal answers rather than throwing',
		!outcome.startsWith('rejected'),
		`companion ${installed ? 'installed' : 'absent'}, ${outcome}`
	);
}

/**
 * Right-clicking a hex is the one way in that hands the command a file rather
 * than asking for one, and a `when` clause that stops matching is a menu item
 * that silently stops appearing. Asserted rather than run: the flash itself ends
 * at a picker or a board, and neither answers in a headless run.
 */
function checkAHexFileOffersTheFlash(extension: vscode.Extension<unknown>): void {
	const items: { command: string; when?: string }[] =
		extension.packageJSON?.contributes?.menus?.['explorer/context'] ?? [];
	const entry = items.find((item) => item.command === COMMANDS.flashHexFile);
	record(
		'a hex file offers the flash on its context menu',
		entry !== undefined && (entry.when ?? '').includes('.hex'),
		entry ? `when: ${entry.when ?? 'always, on every file'}` : `${COMMANDS.flashHexFile} is not on explorer/context`
	);
}

/**
 * A real second extension, loaded by the harness, registering the way a
 * language extension would. Its absence is a harness fault and is reported as
 * one.
 */
async function checkTheFakeLanguageRegistered(): Promise<void> {
	const fake = vscode.extensions.getExtension<FakeLanguageStatus>(FAKE_LANGUAGE_ID);
	if (!fake) {
		record(
			'the fake language is loaded beside this extension',
			false,
			`${FAKE_LANGUAGE_ID} is not loaded. The harness passes test/fixtures/fake-language with --extensionPath on both hosts.`
		);
		return;
	}

	let status: FakeLanguageStatus | undefined;
	try {
		status = await fake.activate();
	} catch (error) {
		record('the fake language registered its menu group', false, `activate() threw: ${String(error)}`);
		return;
	}
	record(
		'the fake language registered its menu group',
		status?.registered === true,
		`registered=${String(status?.registered)}${status?.error ? `, error: ${status.error}` : ''}`
	);
}

/**
 * What the status bar menu shows cannot be read back without opening it, so
 * this is the contract: a group registers and disposes from inside the host,
 * twice without harm, and a malformed one is refused by the name of the field.
 */
function checkAMenuGroupRegistersAndIsGuarded(api: MicrobitManagerApi): void {
	const group: MenuGroup = { label: 'Integration', commands: [{ command: COMMANDS.openTerminal, label: 'Terminal' }] };
	let outcome: string;
	try {
		const registration = api.registerMenuGroup(group);
		registration.dispose();
		registration.dispose();
		outcome = 'registered and disposed twice';
	} catch (error) {
		outcome = `threw: ${String(error)}`;
	}
	record('a menu group registers and disposes', outcome === 'registered and disposed twice', outcome);

	let refusal: unknown;
	try {
		api.registerMenuGroup({ label: '', commands: [] }).dispose();
	} catch (error) {
		refusal = error;
	}
	record(
		'a malformed menu group is refused by the name of the field',
		refusal instanceof TypeError && refusal.message.includes('`label`'),
		refusal instanceof Error ? `${refusal.name}: ${refusal.message}` : 'accepted'
	);
}

/**
 * The layout commands against the fixture's real sidebar, through the
 * workbench's own `vscode.moveViews`, which rejects arguments it does not take,
 * including Hide while combined and Combine while hidden. What ends up visible
 * no API reports: the manual check's.
 */
async function checkTheLayoutCommandsRun(): Promise<void> {
	const { combineSidebars, separateSidebars, hidePanel, showPanel } = COMMANDS;
	const steps = [combineSidebars, hidePanel, combineSidebars, separateSidebars, hidePanel, showPanel];
	const outcomes: string[] = [];
	for (const command of steps) {
		try {
			await vscode.commands.executeCommand(command);
			outcomes.push(`${command.split('.').pop()} ran`);
		} catch (error) {
			outcomes.push(`${command.split('.').pop()} threw: ${String(error)}`);
		}
	}
	record('the layout commands run in any order without an error', outcomes.every((line) => line.endsWith(' ran')), outcomes.join(', '));
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
