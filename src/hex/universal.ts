/**
 * Picking the image a board can actually take.
 *
 * A universal hex holds the V1 and V2 programs interleaved, in record types
 * plain Intel hex does not have. `microbit-connection` parses what it is given
 * with `nrf-intel-hex`, so handing it a universal hex writes both images mixed
 * together at overlapping addresses: the flash appears to run and the board
 * crashes part way through it.
 */
import type { BoardVersion } from '@microbit/microbit-connection';
import { isUniversalHex, microbitBoardId, separateUniversalHex } from '@microbit/microbit-universal-hex';

/**
 * The id a universal hex tags each section with, which is not the id a board
 * reports for itself: a V2 answers `0x9904` while its section is `0x9903`. The
 * version is the only thing that maps reliably.
 */
const SECTION: Record<BoardVersion, number> = {
	V1: microbitBoardId.V1,
	V2: microbitBoardId.V2,
};

/**
 * The hex unchanged when it is not universal, which is most of them, and nothing
 * when it is universal but carries no image this board can run.
 */
export function imageFor(hex: string, version: BoardVersion): string | undefined {
	if (!isUniversalHex(hex)) return hex;

	return separateUniversalHex(hex).find((part) => part.boardId === SECTION[version])?.hex;
}
