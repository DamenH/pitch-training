import { describe, expect, it } from 'vitest';
import { upgradeLegacyHash } from '../src/lib/legacyRoutes';

describe('links to renamed tabs', () => {
  it('sends Anchor to Tune pitch and Sing test to Test sing', () => {
    expect(upgradeLegacyHash('#/anchor/tune')).toBe('#/tune/pitch');
    expect(upgradeLegacyHash('#/anchor')).toBe('#/tune/pitch');
    expect(upgradeLegacyHash('#/anchor/unknown')).toBe('#/tune/pitch');
    expect(upgradeLegacyHash('#/sing-test')).toBe('#/test/sing');
    expect(upgradeLegacyHash('sing-test?x=1')).toBe('#/test/sing?x=1');
  });

  it('leaves current routes alone', () => {
    for (const hash of ['', '#/', '#/tune/pitch', '#/test/sing', '#/identify/chroma', '#/sing-practice']) {
      expect(upgradeLegacyHash(hash)).toBeNull();
    }
  });
});
