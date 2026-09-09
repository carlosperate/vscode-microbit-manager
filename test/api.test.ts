/**
 * The version the extension hands out is the version of the types package a
 * mode compiled against. They are two hand-maintained numbers, and a mode that
 * guards on `api.version` believes this one.
 */
import { describe, expect, it } from 'vitest';

import { API_VERSION } from '../src/api';
import apiPackage from '../api/package.json';

describe('the API version', () => {
	it('is the version of the types package it describes', () => {
		expect(API_VERSION).toBe(apiPackage.version);
	});

	it('is a semver string, which is what the compatibility rule compares', () => {
		expect(API_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
	});
});
