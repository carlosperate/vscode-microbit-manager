import { describe, expect, it, vi } from 'vitest';

import { MICROBIT_FILTER } from '../src/usb/connect';
import { isMicrobitPort, watchForUnplug, type SerialLike } from '../src/serial/webserial';

const BOARD = { usbVendorId: MICROBIT_FILTER.vendorId, usbProductId: MICROBIT_FILTER.productId };

/** A `navigator.serial` that hands out whatever disconnect the test wants. */
function fakeSerial() {
	const listeners: ((event: unknown) => void)[] = [];
	const serial: SerialLike = {
		addEventListener: (_type, listener) => void listeners.push(listener),
		removeEventListener: (_type, listener) => {
			const at = listeners.indexOf(listener);
			if (at !== -1) listeners.splice(at, 1);
		},
	};
	return { serial, listeners, unplug: (target: unknown) => listeners.forEach((listener) => listener({ target })) };
}

describe('which Web Serial port is a micro:bit', () => {
	it('matches the same two ids WebUSB filters on', () => {
		expect(isMicrobitPort(BOARD)).toBe(true);
	});

	/** Every other device on the machine reports through the same event. */
	it('ignores anything else plugged into the same machine', () => {
		expect(isMicrobitPort({ usbVendorId: MICROBIT_FILTER.vendorId, usbProductId: 0x0f00 })).toBe(false);
		expect(isMicrobitPort({ usbVendorId: 0x1234, usbProductId: MICROBIT_FILTER.productId })).toBe(false);
		expect(isMicrobitPort({})).toBe(false);
	});
});

describe('noticing the board go away', () => {
	it('reports a micro:bit being unplugged', () => {
		const lost = vi.fn();
		const { serial, unplug } = fakeSerial();
		watchForUnplug(serial, lost);

		unplug({ getInfo: () => BOARD });
		expect(lost).toHaveBeenCalledOnce();
	});

	it('says nothing when it was something else', () => {
		const lost = vi.fn();
		const { serial, unplug } = fakeSerial();
		watchForUnplug(serial, lost);

		unplug({ getInfo: () => ({ usbVendorId: 0x1234, usbProductId: 0x5678 }) });
		expect(lost).not.toHaveBeenCalled();
	});

	/** A port mid-teardown can refuse to describe itself, and that is not a board going away. */
	it('survives a port that will not say what it is', () => {
		const lost = vi.fn();
		const { serial, unplug } = fakeSerial();
		watchForUnplug(serial, lost);

		expect(() =>
			unplug({
				getInfo: () => {
					throw new Error('port is gone');
				},
			})
		).not.toThrow();
		expect(lost).not.toHaveBeenCalled();
		unplug(undefined);
		expect(lost).not.toHaveBeenCalled();
	});

	it('stops reporting once it is let go', () => {
		const lost = vi.fn();
		const { serial, listeners, unplug } = fakeSerial();
		const stop = watchForUnplug(serial, lost);

		stop();
		expect(listeners).toHaveLength(0);
		unplug({ getInfo: () => BOARD });
		expect(lost).not.toHaveBeenCalled();
	});
});
