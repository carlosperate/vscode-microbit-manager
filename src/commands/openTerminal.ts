import * as vscode from 'vscode';

import { PRODUCT } from '../config';
import { log } from '../log';
import { forgetSerialSession, openEclipseSerial, openNativeSerial } from '../serial/eclipse';
import { watchForUnplug } from '../serial/webserial';
import { reportSerialFailure } from '../serial/failure';
import { openSerialRoute } from '../serial/route';
import { SERIAL_BAUD_RATE, TransportSerialPort } from '../serial/transport-port';
import { connectBoard, getSerialTransport, REQUEST_USB_DEVICE, usbAvailable } from '../usb/connection';
import { MICROBIT_FILTER } from '../usb/connect';

const REQUEST_SERIAL_PORT = 'workbench.experimental.requestSerialPort';
const USE_WEB_SERIAL = 'Use Web Serial';

export async function openTerminal(context: vscode.ExtensionContext): Promise<void> {
	try {
		const commands = await vscode.commands.getCommands(true);
		await openSerialRoute({
			browserDeviceBridges:
				commands.includes(REQUEST_USB_DEVICE) || commands.includes(REQUEST_SERIAL_PORT),
			hasWebUsb: usbAvailable,
			hasWebSerial: () => webSerialAvailable(commands),
			openNative: () => openNativeSerial(commands),
			openWebUsb,
			openWebSerial: () => openWebSerial(context),
			offerWebSerial: async () =>
				(await vscode.window.showInformationMessage(
					`${PRODUCT}: open the terminal through Web Serial instead?`,
					USE_WEB_SERIAL
				)) === USE_WEB_SERIAL,
			unsupported: () => {
				void vscode.window.showErrorMessage(
					`${PRODUCT}: the serial terminal needs WebUSB or Web Serial in this browser.`
				);
			},
		});
	} catch (error) {
		await reportSerialFailure(error);
	}
}

async function openWebUsb(): Promise<boolean> {
	if (!(await connectBoard())) return false;
	const transport = getSerialTransport();
	if (!transport) {
		// The board left between connecting and here, and the UI says so; this is the
		// only trace of why no terminal opened.
		log('The micro:bit was gone before a terminal could be opened');
		return false;
	}

	return openEclipseSerial(
		'webusb',
		new TransportSerialPort(transport, {
			info: { usbVendorId: MICROBIT_FILTER.vendorId, usbProductId: MICROBIT_FILTER.productId },
			disconnected: 'The micro:bit was disconnected.',
		}),
		{ baudRate: SERIAL_BAUD_RATE },
		PRODUCT
	);
}

/** Attached once a terminal is open, and left attached: a port may be replugged. */
let watchingUnplug = false;

async function openWebSerial(context: vscode.ExtensionContext): Promise<boolean> {
	const opened = await openEclipseSerial('webserial', MICROBIT_FILTER, { baudRate: SERIAL_BAUD_RATE }, PRODUCT);
	if (opened) watchForLoss(context);
	return opened;
}

/**
 * Nothing of ours holds a Web Serial port, so this is the only thing that
 * notices the board going away. The terminal itself stays where it is: the
 * companion's API cannot close one, and a user who reads this knows why the
 * terminal in front of them stopped answering.
 */
function watchForLoss(context: vscode.ExtensionContext): void {
	if (watchingUnplug) return;
	let serial: Serial | undefined;
	try {
		serial = navigator.serial;
	} catch (error) {
		log(`Could not watch for the micro:bit being unplugged: ${String(error)}`);
		return;
	}
	if (!serial) return;

	watchingUnplug = true;
	const stop = watchForUnplug(serial, () => {
		forgetSerialSession('webserial');
		log('The micro:bit behind the Web Serial terminal was unplugged');
		void vscode.window.showWarningMessage(
			`${PRODUCT}: the micro:bit was disconnected. Close the serial terminal and open it again once it is back.`
		);
	});

	// Owned by the extension, or an unplug still reports through a torn-down one.
	context.subscriptions.push({
		dispose: () => {
			stop();
			watchingUnplug = false;
		},
	});
}

async function webSerialAvailable(commands: readonly string[]): Promise<boolean> {
	let serial: Serial | undefined;
	try {
		serial = navigator.serial;
	} catch (error) {
		log(`Could not check whether Web Serial is available: ${String(error)}`);
		return false;
	}
	if (!serial) return false;

	try {
		const ports = await serial.getPorts();
		if (
			ports.some((port) => {
				const info = port.getInfo();
				return info.usbVendorId === MICROBIT_FILTER.vendorId && info.usbProductId === MICROBIT_FILTER.productId;
			})
		) {
			return true;
		}
	} catch (error) {
		log(`Could not list authorised Web Serial ports: ${String(error)}`);
	}

	return commands.includes(REQUEST_SERIAL_PORT);
}
