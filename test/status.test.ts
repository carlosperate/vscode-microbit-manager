import { ConnectionStatus, type DeviceErrorCode } from '@microbit/microbit-connection';
import { DeviceError } from '@microbit/microbit-connection';
import { describe, expect, it } from 'vitest';

import { PRODUCT } from '../src/config';
import { describeError, explainDevice } from '../src/ui/errors';
import { createVisibleStatus, describeStatus } from '../src/ui/status';

describe('what the status bar says', () => {
	it('has an answer for every status the library can report', () => {
		for (const status of Object.values(ConnectionStatus)) {
			const { text, tooltip, summary } = describeStatus(status);
			expect(text, status).toMatch(/^\$\([a-z~-]+\) micro:bit$/);
			expect(tooltip, status).toBe(`${PRODUCT}: ${summary}`);
			expect(summary, status).toMatch(/^\S/);
		}
	});

	/**
	 * What the output channel records beside the library's own transitions, which
	 * are in its enum's vocabulary: `NoAuthorizedDevice` after an unplug reads as
	 * though the board was never allowed rather than as though it went away.
	 */
	it('gives the output channel the same words as the tooltip', () => {
		expect(describeStatus(ConnectionStatus.NoAuthorizedDevice).summary).toBe('no micro:bit connected');
		expect(describeStatus(ConnectionStatus.Connected, 'V2').summary).toBe('micro:bit V2 connected');
	});

	/**
	 * The board version is how a user tells at a glance which firmware a flash
	 * will use, and it is the first thing to read when a flash reports success
	 * over a board still running the old program.
	 */
	it('names the board version once there is a board answering', () => {
		expect(describeStatus(ConnectionStatus.Connected, 'V2').text).toBe('$(plug) micro:bit V2');
		expect(describeStatus(ConnectionStatus.Connected, 'V2').tooltip).toBe(`${PRODUCT}: micro:bit V2 connected`);
		expect(describeStatus(ConnectionStatus.Paused, 'V1').text).toBe('$(debug-pause) micro:bit V1');
	});

	/**
	 * The library caches the version across a disconnect, so a status that is not
	 * about a live board must not keep showing it or the bar reads as connected.
	 */
	it('drops it again once the board is gone', () => {
		expect(describeStatus(ConnectionStatus.Disconnected, 'V2').text).toBe('$(debug-disconnect) micro:bit');
		expect(describeStatus(ConnectionStatus.NoAuthorizedDevice, 'V2').text).toBe('$(plug) micro:bit');
	});

	it('uses the disconnected icon only after a board has been live', () => {
		const visibleStatus = createVisibleStatus();
		expect(visibleStatus(ConnectionStatus.NoAuthorizedDevice)).toBe(ConnectionStatus.NoAuthorizedDevice);
		expect(visibleStatus(ConnectionStatus.Connecting)).toBe(ConnectionStatus.Connecting);
		expect(visibleStatus(ConnectionStatus.Connected)).toBe(ConnectionStatus.Connected);
		expect(visibleStatus(ConnectionStatus.NoAuthorizedDevice)).toBe(ConnectionStatus.Disconnected);
		expect(visibleStatus(ConnectionStatus.Connecting)).toBe(ConnectionStatus.Connecting);
		expect(visibleStatus(ConnectionStatus.NoAuthorizedDevice)).toBe(ConnectionStatus.Disconnected);
	});

	/** Connecting is the only status anything is still happening in. */
	it('spins while it is working, and only then', () => {
		const spinning = Object.values(ConnectionStatus).filter((status) => describeStatus(status).text.includes('~spin'));
		expect(spinning).toEqual([ConnectionStatus.Connecting]);
	});

	/**
	 * `Paused` is the library suspending a hidden tab's connection, nothing to do
	 * with flashing, and it is unreachable here because the listener that sets it
	 * needs a `document`. Nothing may be built on it.
	 */
	it('does not describe Paused as anything to do with flashing', () => {
		expect(describeStatus(ConnectionStatus.Paused, 'V2').summary).toBe('micro:bit V2 paused');
	});
});

describe('what a failure reads as', () => {
	const codes: DeviceErrorCode[] = [
		'aborted',
		'no-device-selected',
		'unsupported',
		'disabled',
		'permission-denied',
		'location-disabled',
		'not-connected',
		'device-in-use',
		'device-disconnected',
		'timeout',
		'connection-error',
		'firmware-update-required',
		'pairing-information-lost',
	];

	it('says something usable, or deliberately nothing, for every code', () => {
		for (const code of codes) {
			const message = explainDevice(new DeviceError({ code }));
			if (message === undefined) continue;
			// A finished sentence, continuing the product name the caller prefixes,
			// and long enough to tell somebody what to do next.
			expect(message, code).not.toMatch(new RegExp(`^${PRODUCT}`));
			expect(message, code).toMatch(/\.$|\/$/);
			expect(message.length, code).toBeGreaterThan(30);
		}
	});

	/** The user closed the chooser, so they already know, and a toast is nagging. */
	it('stays quiet about a cancellation', () => {
		expect(explainDevice(new DeviceError({ code: 'no-device-selected' }))).toBeUndefined();
		expect(explainDevice(new DeviceError({ code: 'aborted' }))).toBeUndefined();
	});

	it('names the two failures a classroom actually hits', () => {
		expect(explainDevice(new DeviceError({ code: 'device-in-use' }))).toContain('already in use');
		expect(explainDevice(new DeviceError({ code: 'firmware-update-required' }))).toContain('microbit.org');
	});

	/**
	 * The message a user quotes has to be traceable back to the entry that
	 * produced it, and the code is the only thing that ties the two together:
	 * `DeviceError` sets no `name`, so it otherwise stringifies as a bare `Error:`.
	 */
	it('records the code in the log even though the error hides it', () => {
		const error = new DeviceError({ code: 'device-in-use', message: 'Unable to claim interface.' });
		expect(String(error)).toBe('Error: Unable to claim interface.');
		expect(describeError(error)).toBe('device-in-use, Unable to claim interface.');
		expect(describeError(new TypeError('x is not a function'))).toBe('TypeError: x is not a function');
	});

	/** A code from a newer library, and a defect of ours, must both stay readable. */
	it('falls back rather than showing a blank message', () => {
		expect(explainDevice(new DeviceError({ code: 'invented' as DeviceErrorCode }))).toContain('see the output');
		expect(explainDevice(new TypeError('x is not a function'))).toContain('see the output');
	});
});
