import { describe, expect, it } from 'vitest';

import { isPublicAddress } from './public-address';

describe('isPublicAddress', () => {
  it('lets public addresses through', () => {
    for (const address of [
      '8.8.8.8',
      '1.1.1.1',
      '46.224.2.250',
      '2606:4700:4700::1111',
    ]) {
      expect(isPublicAddress(address), address).toBe(true);
    }
  });

  it('refuses loopback, private, link-local and reserved IPv4', () => {
    for (const address of [
      '127.0.0.1',
      '127.8.9.10',
      '10.0.0.5',
      '172.16.0.1',
      '172.31.255.255',
      '192.168.1.1',
      '169.254.169.254',
      '100.64.0.1',
      '0.0.0.0',
      '224.0.0.1',
      '255.255.255.255',
    ]) {
      expect(isPublicAddress(address), address).toBe(false);
    }
  });

  it('refuses their IPv6 counterparts, and IPv4 hidden inside IPv6', () => {
    for (const address of [
      '::1',
      '::',
      'fd12:3456::1',
      'fe80::1',
      'ff02::1',
      '::ffff:127.0.0.1',
      '::ffff:169.254.169.254',
      '::ffff:7f00:1',
      '64:ff9b::7f00:1',
    ]) {
      expect(isPublicAddress(address), address).toBe(false);
    }
  });

  it('keeps the edges of the private ranges straight', () => {
    expect(isPublicAddress('172.15.255.255')).toBe(true);
    expect(isPublicAddress('172.32.0.0')).toBe(true);
    expect(isPublicAddress('100.128.0.0')).toBe(true);
  });

  it('refuses anything that is not an address at all', () => {
    expect(isPublicAddress('localhost')).toBe(false);
    expect(isPublicAddress('')).toBe(false);
  });
});
