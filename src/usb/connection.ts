/**
 * The one WebUSB connection this extension owns, and the seam every command that
 * needs a board goes through. Module level for the same reason the output
 * channel is: a command handler has no other way to reach it.
 */
import { ConnectionStatus, type BoardVersion } from '@microbit/microbit-connection';
import {
	createUSBConnection,
	DeviceSelectionMode,
	type MicrobitUSBConnection,
} from '@microbit/microbit-connection/usb';
import * as vscode from 'vscode';

import { CAN_PAIR_CONTEXT, PRODUCT } from '../config';
import { log } from '../log';
import {
	CHOOSER_REFUSED,
	describeError,
	explainDevice,
	NO_PAIRING,
	NO_WEBUSB,
	NOT_A_MICROBIT,
	WRONG_BOARD,
} from '../ui/errors';
import { revealSerialSession } from '../serial/eclipse';
import { SerialWriteGate } from '../serial/transport';
import type { SerialTransport } from '../serial/types';
import { createStatusBar, type StatusBar } from '../ui/statusbar';
import { connectToBoard, isMicrobit, MICROBIT_FILTER, type Outcome, type UsbIdentity } from './connect';
import { boardStillMissing, disconnectAction, isIdle, mayJoinAttempt, shouldRecover } from './policy';

/**
 * VS Code's bridge for `requestDevice`, which is `Window`-only and so out of
 * reach from a worker. **Only the web workbench registers it**: desktop carries
 * the class that would and never instantiates it, so a board can be used there
 * and never authorised.
 */
export const REQUEST_USB_DEVICE = 'workbench.experimental.requestUsbDevice';

/**
 * A device is absent from `getDevices()` for the whole turn its own disconnect
 * event fires, so a check made there finds nothing every time. Waiting is what
 * tells a reset that comes straight back from a cable pulled out.
 */
const RESETTLE_MS = 1500;

let connection: MicrobitUSBConnection | undefined;
let serialTransport: SerialWriteGate | undefined;
let statusBar: StatusBar | undefined;
let recovering = false;

/**
 * The connect in flight, which every question about whether there is a board has
 * to consult: USB never reports `Connecting`, so the library's own status stays
 * at its previous value throughout one.
 */
let attempt: Promise<Attempted> | undefined;

/** Asked for back mid-connect. A chooser is the host's window and cannot be closed from here. */
let releaseWhenIdle = false;

/** The terms the attempt in flight was started on, which decide who may join it. */
let attemptMayPair = false;

/**
 * The release in flight. The library sets `Disconnected` only once the device is
 * given back, so the status reads `Connected` throughout one and everything that
 * asks about a board has to consult this instead.
 */
let releasing: Promise<void> | undefined;

/**
 * One release at a time, and everything that gives the board back goes through
 * it. Terminal input is held and drained around the whole of it: the terminal
 * echoes every keystroke itself, so anything accepted while the board is going
 * away stays on screen looking like it was sent.
 */
function releaseBoard(board: MicrobitUSBConnection): Promise<void> {
	releasing ??= withSerialWritesBlocked(() => board.disconnect()).finally(() => {
		releasing = undefined;
	});
	return releasing;
}

/**
 * Holds terminal input out of the board for the length of an operation, draining
 * whatever was accepted before it. Nothing is held where no terminal is open.
 */
const withSerialWritesBlocked = <T>(operation: () => Promise<T>): Promise<T> =>
	serialTransport ? serialTransport.withWritesBlocked(operation) : operation();

/** A finished attempt, either way, since callers word failure differently. */
type Attempted = { outcome: Outcome } | { error: unknown };

/**
 * Whether the bridge is registered, answered once at activation because
 * `getCommands` is an await and nothing registers it later. `undefined` reads as
 * "probably yes": a wrong refusal lasts the session, a wrong yes costs one call.
 */
let bridged: boolean | undefined;

/**
 * Builds the connection, shows the status bar, and reconnects to a board that is
 * already authorised. `getDevices()` needs no user gesture, so a returning user
 * is connected before they ask for it.
 */
export function createBoard(context: vscode.ExtensionContext): void {
	const bar = createStatusBar();
	const board = createUSBConnection({
		logging: {
			log: (entry) => log(`Board: ${String(entry)}`),
			error: (message, error) => log(`Board: ${message}: ${String(error)}`),
			event: (entry) => log(`Board: ${entry.type}${entry.message ? ` ${entry.message}` : ''}`),
		},
		// Try every authorised device before asking, since the asking is what this
		// host cannot do. The guard below is what keeps it from ever getting there.
		deviceSelectionMode: DeviceSelectionMode.UseAnyAllowed,
		// A worker has no document to go hidden, so this only ever costs a listener.
		pauseOnHidden: false,
	});

	const onStatus = ({ status, previousStatus }: { status: ConnectionStatus; previousStatus: ConnectionStatus }) => {
		bar.update(status, versionOf(board));
		if (shouldRecover(status, previousStatus)) void recover(board);
	};
	board.addEventListener('status', onStatus);
	board.addEventListener('beforerequestdevice', chooserWasReached);

	// The terminal sees the board only through this: reads come off the connection's
	// own events, and writes are the thing a release has to hold and drain.
	const transport = new SerialWriteGate(
		{
			onData: (listener) => {
				const wrapped = ({ data }: { data: string }) => listener(data);
				board.addEventListener('serialdata', wrapped);
				return () => board.removeEventListener('serialdata', wrapped);
			},
			onDisconnect: (listener) => {
				const wrapped = () => {
					if (!boardAttached()) listener();
				};
				board.addEventListener('status', wrapped);
				return () => board.removeEventListener('status', wrapped);
			},
			write: async (data) => {
				if (isConnected(board)) await board.serialWrite(data);
			},
		},
		(characters) => log(`${characters} character(s) typed while the micro:bit was busy were discarded`)
	);

	connection = board;
	serialTransport = transport;
	statusBar = bar;
	context.subscriptions.push({
		dispose: () => {
			connection = undefined;
			serialTransport = undefined;
			statusBar = undefined;
			board.removeEventListener('status', onStatus);
			board.removeEventListener('beforerequestdevice', chooserWasReached);
			try {
				// The library reads `navigator.usb` here unguarded: a hostile getter
				// would throw and strand the status bar item.
				board.dispose();
			} catch (error) {
				log(`Could not release the board connection: ${describeError(error)}`);
			}
			bar.dispose();
		},
	});

	// A `Thenable` has no `catch`, so the failure handler is the second argument.
	// Unhandled it would be invisible: the worker never fires `unhandledrejection`,
	// so nothing anywhere would say the probe failed.
	void vscode.commands.getCommands(true).then(
		(registered) => {
			bridged = registered.includes(REQUEST_USB_DEVICE);
			// Hides Connect and Disconnect from the palette; set only here, so it is the probe's answer.
			void vscode.commands.executeCommand('setContext', CAN_PAIR_CONTEXT, bridged).then(undefined, (error: unknown) =>
				log(`Could not say whether this host can pair: ${describeError(error)}`)
			);
			log(bridged ? 'This host can pair a micro:bit' : 'This host can only use a micro:bit something else authorised');
		},
		(error: unknown) => log(`Could not tell whether this host can pair a micro:bit: ${describeError(error)}`)
	);

	void start(board);
}

/**
 * `initialize()` attaches the disconnect listener everything else here reacts to,
 * and reads `navigator.usb` unguarded, which some privacy extensions replace
 * with a throwing getter. Its failure must not take the silent connect with it.
 */
async function start(board: MicrobitUSBConnection): Promise<void> {
	try {
		await board.initialize();
	} catch (error) {
		log(`The board connection could not be initialised: ${describeError(error)}`);
	}
	await connectSilently(board);
}

/**
 * Hands the board back before the host goes away. `deactivate`'s to call and not
 * a subscription's: `dispose()` is synchronous, so a disconnect started there is
 * abandoned and the next window finds the interface still claimed.
 */
export async function shutdownBoard(): Promise<void> {
	const board = connection;
	if (!board) return;

	// USB never reports `Connecting`, so the status still reads as whatever it was
	// before a connect started: waiting for the attempt is the only way to know
	// there is anything to hand back. Disconnected here rather than through
	// `releaseWhenIdle`, because that release is voided and would not be awaited.
	if (attempt) {
		// Taking the release back off a Disconnect that asked for one, so the board
		// is handed back once, here, where it is awaited.
		releaseWhenIdle = false;
		await attempt.then(undefined, () => undefined);
	}
	if (isIdle(board.status)) return;

	try {
		await releaseBoard(board);
	} catch (error) {
		log(`Could not hand the micro:bit back on shutdown: ${describeError(error)}`);
	}
}

/**
 * Dispatched as the first statement of the library's own `chooseDevice()`, which
 * calls a `requestDevice` that does not exist here and fails as `requestDevice is
 * not a function` with nothing to say where it came from. Throwing names it, and
 * the library disconnects cleanly around it.
 */
function chooserWasReached(): never {
	const message =
		'The device chooser was reached inside the extension host, where it does not exist. Pairing goes through ' +
		'VS Code, so something asked the connection to find a board with none authorised.';
	log(message);
	throw new Error(message);
}

/**
 * Connect, pairing first when nothing is authorised yet. A `false` has already
 * been reported, or was a cancellation needing no report, so a caller can stop.
 */
export async function connectBoard(): Promise<boolean> {
	const board = connection;
	if (!board) return false;

	// A board on its way out still reports `Connected`, so answering before the
	// release finishes would report success for a board about to go.
	if (releasing) await releasing;
	if (isConnected(board)) return true;

	// Otherwise a Firefox-shaped failure reads as a blocked chooser, not this.
	if (!(await usbAvailable())) {
		warn(NO_WEBUSB);
		return false;
	}

	// A background attempt may not open a chooser, so joining one would refuse this
	// caller on terms it never asked for. Let it finish, then ask again.
	if (attempt && !mayJoinAttempt(attemptMayPair, true)) {
		await attempt.then(undefined, () => undefined);
		if (isConnected(board)) return true;
	}

	const attempted = await connectOnce(board, true);
	if ('error' in attempted) {
		log(`Could not connect: ${describeError(attempted.error)}`);
		warn(explainDevice(attempted.error));
		return false;
	}

	return report(board, attempted.outcome);
}

export async function disconnectBoard(heldByTerminal: boolean): Promise<void> {
	const board = connection;
	if (!board) {
		await reportNothingOfOurs(heldByTerminal);
		return;
	}

	switch (
		disconnectAction({
			status: board.status,
			connecting: attempt !== undefined,
			releasing: releasing !== undefined,
			heldByTerminal,
		})
	) {
		case 'nothing-connected':
			void vscode.window.showInformationMessage(`${PRODUCT}: no micro:bit is connected.`);
			return;
		case 'held-by-terminal':
			await reportNothingOfOurs(true);
			return;
		case 'wait-for-connect':
			releaseWhenIdle = true;
			void vscode.window.showInformationMessage(
				`${PRODUCT}: connecting to a micro:bit right now, and it will be disconnected as soon as that finishes.`
			);
			return;
		// The press that started it reports for both, rather than a second message.
		case 'already-releasing':
			await releasing;
			return;
		case 'release':
			await releaseBoard(board);
			void vscode.window.showInformationMessage(`${PRODUCT}: the micro:bit is disconnected.`);
	}
}

/**
 * With no connection of ours, a Web Serial terminal may still hold the port. It
 * is revealed rather than described, both because that is the terminal the user
 * has to close and because nothing else reports one they closed already: a
 * handle that no longer resolves is how that is noticed.
 */
async function reportNothingOfOurs(heldByTerminal: boolean): Promise<void> {
	if (heldByTerminal && (await revealSerialSession('webserial'))) {
		void vscode.window.showInformationMessage(
			`${PRODUCT}: the serial terminal holds this micro:bit. Close that terminal to release it.`
		);
		return;
	}
	void vscode.window.showInformationMessage(`${PRODUCT}: no micro:bit is connected.`);
}

/**
 * Whether there is a board to hand back, which decides Connect against
 * Disconnect. Read from the library each time: a copy of ours would drift the
 * first time a cable came out between one menu and the next.
 */
export const boardAttached = (): boolean => connection !== undefined && !isIdle(connection.status);

/** The terminal sees only the serial operations coordinated by this module. */
export const getSerialTransport = (): SerialTransport | undefined => (boardAttached() ? serialTransport : undefined);

/** Which micro:bit is on the other end, which decides the image a hex is built from. */
export const boardVersion = (): BoardVersion | undefined => (connection ? versionOf(connection) : undefined);

/** Which physical board is on the other end, so a same-version swap is still visible. */
export const boardSerialNumber = (): string | undefined =>
	(connection ? connection.getDevice()?.serialNumber : undefined) ?? undefined;

/**
 * Whether this host can talk to USB at all. The library owns the probe: its
 * whole body is a `navigator.usb` read, which is the property a privacy
 * extension replaces with a throwing getter.
 */
export async function usbAvailable(): Promise<boolean> {
	if (!connection) return false;
	try {
		return (await connection.checkAvailability()) === 'available';
	} catch (error) {
		log(`Could not check whether WebUSB is available: ${String(error)}`);
		return false;
	}
}

/**
 * One connect at a time, whoever asked. Two overlapping attempts build two
 * wrappers over the same device, and the second fails to claim its interface:
 * the user is then told another tab holds a board nothing else is holding.
 */
function connectOnce(board: MicrobitUSBConnection, mayPair: boolean): Promise<Attempted> {
	if (attempt) return attempt;
	attemptMayPair = mayPair;
	attempt = runConnect(board, mayPair).finally(() => {
		attempt = undefined;
		if (releaseWhenIdle) {
			releaseWhenIdle = false;
			void releaseBoard(board).then(undefined, (error: unknown) => log(`Could not release: ${describeError(error)}`));
		}
	});
	return attempt;
}

/** `mayPair` belongs to the attempt, so a caller joining one gets its terms. */
async function runConnect(board: MicrobitUSBConnection, mayPair: boolean): Promise<Attempted> {
	// Ours to show and to take away: USB goes straight from no device to connected.
	statusBar?.update(ConnectionStatus.Connecting);
	try {
		return {
			outcome: await connectToBoard({
				authorised: authorisedDevices,
				// A background attempt never opens a chooser nobody asked for.
				canPair: () => mayPair && bridged !== false,
				// Nothing slow in front of this: transient activation is ~5 s in Chromium.
				pair: () => vscode.commands.executeCommand(REQUEST_USB_DEVICE, { filters: [MICROBIT_FILTER] }),
				connect: () => board.connect(),
				attached: () => board.getDevice(),
				log,
			}),
		};
	} catch (error) {
		return { error };
	} finally {
		// A success already moved the bar; everything else has to put it back.
		if (board.status !== ConnectionStatus.Connected) statusBar?.update(board.status, versionOf(board));
	}
}

async function report(board: MicrobitUSBConnection, outcome: Outcome): Promise<boolean> {
	switch (outcome.done) {
		case 'connected':
			return true;
		case 'wrong-board':
			// Awaited: an immediate retry must find it gone, not still `Connected`.
			await releaseBoard(board).then(undefined, (error: unknown) => log(`Could not release: ${describeError(error)}`));
			warn(WRONG_BOARD);
			return false;
		// The user closed the chooser, so they know, and there is nothing to add.
		case 'declined':
			return false;
		case 'unpairable':
			warn(NO_PAIRING);
			return false;
		case 'refused':
			log(`The device chooser did not open: ${String(outcome.reason)}`);
			warn(CHOOSER_REFUSED);
			return false;
		case 'unauthorised':
			warn(NOT_A_MICROBIT);
			return false;
	}
}

/**
 * One silent retry before saying anything. A reset drops the device and brings
 * it straight back, and a warning for that is noise; a real unplug leaves
 * nothing to reconnect to and is worth exactly one message.
 */
async function recover(board: MicrobitUSBConnection): Promise<void> {
	if (recovering) return;
	recovering = true;
	try {
		await pause(RESETTLE_MS);
		// The wait is long enough for the window to have been closed, or for the user
		// to have taken the board back themselves, and reconnecting then would claim
		// a device nobody asked for.
		if (connection !== board || !boardStillMissing(board.status)) return;
		const attempted = await connectOnce(board, false);
		// Anything short of connected is a board that did not come back.
		if ('outcome' in attempted && attempted.outcome.done === 'connected') {
			log('The micro:bit came back and was reconnected without asking');
			return;
		}
		log(`The micro:bit did not come back: ${describeAttempt(attempted)}`);
	} finally {
		recovering = false;
	}

	void vscode.window.showWarningMessage(`${PRODUCT}: the micro:bit was disconnected.`);
}

/** Unasked for, so a failure stays in the output channel. */
async function connectSilently(board: MicrobitUSBConnection): Promise<void> {
	const boards = (await authorisedDevices()).filter(isMicrobit);
	if (boards.length === 0) return;

	log(`${boards.length} micro:bit(s) already authorised, connecting without asking`);
	const attempted = await connectOnce(board, false);
	if (!('outcome' in attempted) || attempted.outcome.done !== 'connected') {
		log(`The silent connect failed: ${describeAttempt(attempted)}`);
	}
}

const describeAttempt = (attempted: Attempted) =>
	'error' in attempted ? describeError(attempted.error) : attempted.outcome.done;

/** Unfiltered, and `navigator.usb` is read inside the guard: a privacy extension can make it throw. */
async function authorisedDevices(): Promise<UsbIdentity[]> {
	try {
		const usb: USB | undefined = navigator.usb;
		return usb ? await usb.getDevices() : [];
	} catch (error) {
		log(`Could not list the authorised USB devices: ${String(error)}`);
		return [];
	}
}

/** A call, not a comparison: `status` is a getter and an await can change it under a narrowed one. */
const isConnected = (board: MicrobitUSBConnection): boolean => board.status === ConnectionStatus.Connected;

/** Cached by the library until the device is cleared, so it survives a disconnect. */
function versionOf(board: MicrobitUSBConnection): BoardVersion | undefined {
	try {
		return board.getBoardVersion();
	} catch {
		return undefined;
	}
}

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const warn = (message: string | undefined) => {
	if (message) void vscode.window.showErrorMessage(`${PRODUCT}: ${message}`);
};
