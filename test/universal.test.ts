import { createUniversalHex, microbitBoardId } from '@microbit/microbit-universal-hex';
import { describe, expect, it } from 'vitest';

import { imageFor } from '../src/hex/universal';

/** A tiny but real Intel hex, so the separation is exercised rather than mocked. */
const intelHex = (byte: number) => {
	const data = [0x02, 0x00, 0x00, 0x00, byte, byte];
	const sum = data.reduce((total, value) => total + value, 0);
	const checksum = (0x100 - (sum % 0x100)) % 0x100;
	const record = [...data, checksum].map((value) => value.toString(16).padStart(2, '0').toUpperCase()).join('');
	return `:${record}\n:00000001FF\n`;
};

const V1_HEX = intelHex(0x11);
const V2_HEX = intelHex(0x22);

const universal = createUniversalHex([
	{ hex: V1_HEX, boardId: microbitBoardId.V1 },
	{ hex: V2_HEX, boardId: microbitBoardId.V2 },
]);

describe('picking the image a board can take', () => {
	/**
	 * The whole point: handing a universal hex to the connection library writes
	 * both images mixed together, because it parses what it is given as plain
	 * Intel hex.
	 */
	it('separates a universal hex and gives back only that board', () => {
		expect(imageFor(universal, 'V1')).toContain('1111');
		expect(imageFor(universal, 'V1')).not.toContain('2222');
		expect(imageFor(universal, 'V2')).toContain('2222');
		expect(imageFor(universal, 'V2')).not.toContain('1111');
	});

	/** Most hexes are for one board and must go through untouched. */
	it('leaves a plain Intel hex alone', () => {
		expect(imageFor(V2_HEX, 'V2')).toBe(V2_HEX);
		expect(imageFor(V2_HEX, 'V1')).toBe(V2_HEX);
	});

	/** Refusing beats writing the other board's image and crashing the target. */
	it('answers with nothing for a universal hex that has nothing for this board', () => {
		const onlyV2 = createUniversalHex([{ hex: V2_HEX, boardId: microbitBoardId.V2 }]);
		expect(imageFor(onlyV2, 'V1')).toBeUndefined();
		expect(imageFor(onlyV2, 'V2')).toContain('2222');
	});
});
