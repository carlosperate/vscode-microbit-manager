import { expect, it } from 'vitest';

import manifest from '../package.json';
import { SERIAL_MONITOR_EXTENSION } from '../src/config';

/**
 * One companion and no more. A pack installs alongside and leaves the user free
 * to remove it; anything added here is another extension arriving with this one.
 */
it('offers the exact extension-pack companions', () => {
	expect(manifest.extensionPack).toEqual([SERIAL_MONITOR_EXTENSION]);
});
