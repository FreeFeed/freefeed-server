/* eslint-env node, mocha */
import expect from 'unexpected';

import { Address } from '../../../app/support/ipv6';


describe('IPv6 parser', () => {
  describe('Just addresses', () => {
    it(`should parse '::' address`, () => {
      const addr = new Address('::');
      expect(addr.bytes, 'to equal', [
        0, 0, 0, 0,
        0, 0, 0, 0,
        0, 0, 0, 0,
        0, 0, 0, 0,
      ]);
    });

    it(`should parse IPv4 address`, () => {
      const addr = new Address('127.0.0.1');
      expect(addr.bytes, 'to equal', [
        0, 0, 0, 0,
        0, 0, 0, 0,
        0, 0,  0xff, 0xff,
        127, 0, 0, 1]);
      expect(addr.isIP4(), 'to be true');
    });

    it(`should parse IPv4 tail with '::' prefix`, () => {
      const addr = new Address('::127.0.0.1');
      expect(addr.bytes, 'to equal', [
        0, 0, 0, 0,
        0, 0, 0, 0,
        0, 0, 0, 0,
        127, 0, 0, 1
      ]);
      expect(addr.isIP4(), 'to be false');
    });

    it(`should parse full-length IPv6 address`, () => {
      const addr = new Address('FEDC:BA98:7654:3210:FEDC:BA98:7654:3210');
      expect(addr.bytes, 'to equal', [
        0xFE, 0xDC, 0xBA, 0x98,
        0x76, 0x54, 0x32, 0x10,
        0xFE, 0xDC, 0xBA, 0x98,
        0x76, 0x54, 0x32, 0x10,
      ]);
      expect(addr.isIP4(), 'to be false');
    });

    it(`should parse full-length IPv6 address without leading zeros`, () => {
      const addr = new Address('1080:0:0:0:8:800:200C:417A');
      expect(addr.bytes, 'to equal', [
        0x10, 0x80, 0, 0,
        0, 0, 0, 0,
        0, 0x8, 0x8, 0,
        0x20, 0x0C, 0x41, 0x7A,
      ]);
      expect(addr.isIP4(), 'to be false');
    });

    it(`should parse IPv6 address with missing zero blocks [1]`, () => {
      const addr = new Address('FEDC:BA98:7654::FEDC:BA98:7654:3210');
      expect(addr.bytes, 'to equal', [
        0xFE, 0xDC, 0xBA, 0x98,
        0x76, 0x54, 0, 0,
        0xFE, 0xDC, 0xBA, 0x98,
        0x76, 0x54, 0x32, 0x10,
      ]);
      expect(addr.isIP4(), 'to be false');
    });

    it(`should parse IPv6 address with missing zero blocks [2]`, () => {
      const addr = new Address('FF01::101');
      expect(addr.bytes, 'to equal', [
        0xff, 0x01, 0, 0,
        0, 0, 0, 0,
        0, 0, 0, 0,
        0, 0, 0x01, 0x01,
      ]);
      expect(addr.isIP4(), 'to be false');
    });

    it(`should parse IPv6 address with missing zero blocks at start`, () => {
      const addr = new Address('::101');
      expect(addr.bytes, 'to equal', [
        0, 0, 0, 0,
        0, 0, 0, 0,
        0, 0, 0, 0,
        0, 0, 0x01, 0x01,
      ]);
      expect(addr.isIP4(), 'to be false');
    });

    it(`should parse IPv6 address with missing zero blocks at end`, () => {
      const addr = new Address('FF01::');
      expect(addr.bytes, 'to equal', [
        0xff, 0x01, 0, 0,
        0, 0, 0, 0,
        0, 0, 0, 0,
        0, 0, 0, 0,
      ]);
      expect(addr.isIP4(), 'to be false');
    });

    it(`should parse IPv4-in-IPv6 address`, () => {
      const addr = new Address('::FFFF:129.144.52.38');
      expect(addr.bytes, 'to equal', [
        0, 0, 0, 0,
        0, 0, 0, 0,
        0, 0, 0xff, 0xff,
        129, 144, 52, 38,
      ]);
      expect(addr.isIP4(), 'to be true');
    });

    it(`should parse IPv4-in-IPv6 address in hex form`, () => {
      const addr = new Address('::FFFF:8190:3426');
      expect(addr.bytes, 'to equal', [
        0, 0, 0, 0,
        0, 0, 0, 0,
        0, 0, 0xff, 0xff,
        0x81, 0x90, 0x34, 0x26,
      ]);
      expect(addr.isIP4(), 'to be true');
    });
  });

  describe('Masks', () => {
    it(`should parse IPv4 address with mask`, () => {
      const addr = new Address('127.0.0.1/24');
      expect(addr.maskBits, 'to be', 24 + 96);
    });

    it(`should parse IPv4-in-IPv6 address with mask`, () => {
      const addr = new Address('::FFFF:129.144.52.38/120');
      expect(addr.maskBits, 'to be', 120);
    });

    it(`should parse IPv6 address with mask`, () => {
      const addr = new Address('FF01::/64');
      expect(addr.maskBits, 'to be', 64);
    });
  });

  describe('toString', () => {
    it(`should stringify IPv4 address`, () => {
      const addr = new Address('127.0.0.1');
      expect(addr.toString(), 'to be', '127.0.0.1');
    });

    it(`should stringify full-length IPv6 address`, () => {
      const addr = new Address('FEDC:BA98:7654:3210:FEDC:BA98:7654:3210');
      expect(addr.toString(), 'to be', 'fedc:ba98:7654:3210:fedc:ba98:7654:3210');
    });

    it(`should stringify IPv6 address with zero blocks`, () => {
      const addr = new Address('::101');
      expect(addr.toString(), 'to be', '::101');
    });

    it(`should stringify IPv4 mask`, () => {
      const addr = new Address('127.0.0.1/8');
      expect(addr.toString(), 'to be', '127.0.0.1/8');
    });

    it(`should stringify IPv6 mask`, () => {
      const addr = new Address('FF01::/64');
      expect(addr.toString(), 'to be', 'ff01::/64');
    });
  });

  describe('contains', () => {
    it(`address always contains itself`, () => {
      expect(new Address('127.0.0.1').contains(new Address('127.0.0.1')), 'to be true');
    });

    it(`mask always contains itself`, () => {
      expect(new Address('127.0.0.1/8').contains(new Address('127.0.0.1/8')), 'to be true');
    });

    it(`should not contain wider mask`, () => {
      expect(new Address('127.0.0.1/16').contains(new Address('127.0.0.1/8')), 'to be false');
    });

    it(`should contain address`, () => {
      expect(new Address('127.0.0.1/16').contains(new Address('127.0.10.18')), 'to be true');
    });

    it(`should not contain address not in mask`, () => {
      expect(new Address('127.0.0.1/16').contains(new Address('127.1.10.18')), 'to be false');
    });

    it(`should contain address with not byte-aligned mask`, () => {
      expect(new Address('127.0.0.0/15').contains(new Address('127.1.10.18')), 'to be true');
    });

    it(`should not contain address not in mask with not byte-aligned mask`, () => {
      expect(new Address('127.0.0.0/15').contains(new Address('127.3.10.18')), 'to be false');
    });
  });
});
