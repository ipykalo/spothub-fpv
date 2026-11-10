import { BlockList, isIP } from 'node:net';

/**
 * Addresses the link preview must never connect to: loopback, the private
 * ranges, link-local (where a cloud host's metadata service answers, with its
 * credentials), carrier-grade NAT, multicast and the reserved blocks — and
 * their IPv6 counterparts, including IPv4 written inside IPv6.
 *
 * Checked against the address actually connected to, not the hostname in the
 * link: a public name can resolve to 127.0.0.1, and a public page can redirect
 * to one.
 */
const BLOCKED = new BlockList();

for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  BLOCKED.addSubnet(network, prefix, 'ipv4');
}

for (const [network, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['64:ff9b::', 96],
  ['100::', 64],
  ['2001:db8::', 32],
  ['fc00::', 7],
  ['fe80::', 10],
  ['fec0::', 10],
  ['ff00::', 8],
] as const) {
  BLOCKED.addSubnet(network, prefix, 'ipv6');
}

/** IPv4 inside IPv6 — `::ffff:127.0.0.1` — is judged as the IPv4 it carries. */
const MAPPED_IPV4 = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i;

/** True only for an address on the public internet. Anything unparseable is not. */
export function isPublicAddress(address: string): boolean {
  const mapped = MAPPED_IPV4.exec(address);

  if (mapped) {
    return isPublicAddress(mapped[1]);
  }

  const family = isIP(address);

  if (family === 4) {
    return !BLOCKED.check(address, 'ipv4');
  }

  if (family === 6) {
    // The rest of ::ffff:0:0/96, written in hex, is not public either.
    return !address.toLowerCase().startsWith('::ffff:') && !BLOCKED.check(address, 'ipv6');
  }

  return false;
}
