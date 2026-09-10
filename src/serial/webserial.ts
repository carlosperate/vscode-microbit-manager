/**
 * The Web Serial fallback, used where there is no WebUSB. The port belongs to
 * the companion that opened it and this extension never holds one, so all that
 * is left here is noticing when the device behind it goes away.
 */
import { MICROBIT_FILTER } from '../usb/connect';

/** Web Serial names the same two ids differently from WebUSB. */
export interface PortInfoLike {
	usbVendorId?: number;
	usbProductId?: number;
}

export interface PortLike {
	getInfo(): PortInfoLike;
}

/** Injected so the watcher can be tested without a browser. */
export interface SerialLike {
	addEventListener(type: 'disconnect', listener: (event: unknown) => void): void;
	removeEventListener(type: 'disconnect', listener: (event: unknown) => void): void;
}

export const isMicrobitPort = (info: PortInfoLike): boolean =>
	info.usbVendorId === MICROBIT_FILTER.vendorId && info.usbProductId === MICROBIT_FILTER.productId;

/**
 * Web Serial reports a device going away on `navigator.serial` and not on the
 * port, and there is no connection of ours watching it: without this a board
 * unplugged mid-session leaves a terminal that has simply stopped answering,
 * which reads as the editor having broken.
 */
export function watchForUnplug(serial: SerialLike, lost: () => void): () => void {
	const listener = (event: unknown) => {
		const port = (event as { target?: PortLike } | undefined)?.target;
		let info: PortInfoLike | undefined;
		try {
			info = port?.getInfo();
		} catch {
			// A port mid-teardown can refuse; anything unreadable is not ours to claim.
			return;
		}
		if (info && isMicrobitPort(info)) lost();
	};
	serial.addEventListener('disconnect', listener);
	return () => serial.removeEventListener('disconnect', listener);
}
