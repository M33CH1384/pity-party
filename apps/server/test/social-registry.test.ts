import { describe, expect, it } from 'vitest';
import { SOCIAL_MODE_IDS } from '@pp/protocol';
import { INVITE_MODE_NAME } from '../src/push/notify';

describe('social on registry modes (5b)', () => {
  it('every mode an invite/presence may carry has a push display name, and nothing else does', () => {
    expect(Object.keys(INVITE_MODE_NAME).sort()).toEqual([...SOCIAL_MODE_IDS].sort());
  });
});
