// Octal (with leading zero) and hex (0x...) syntaxes are not supported!
const ip4Octet = `25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9]`;

export class Address {
  bytes = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

  maskBits = 128;

  /**
   * Parses the string representation of IPv6/IPv4 address
   *
   * @param {string} str
   */
  constructor(str) {
    const origStr = str;
    const assert = (test = false) => {
      if (!test) {
        throw new Error(`Invalid IP address syntax: ${origStr}`);
      }
    };

    // Have a mask?
    let withMask = false;

    {
      const m = /(.+)\/([1-9]\d*)$/.exec(str);

      if (m) {
        withMask = true;
        [, str] = m;
        this.maskBits = parseInt(m[2], 10);
        assert(this.maskBits <= 128);
      }
    }

    if (str === '::') {
      return;
    }

    // Have IPv4 tail?
    const m = new RegExp(
      `(^|.*:)(${ip4Octet})[.](${ip4Octet})[.](${ip4Octet})[.](${ip4Octet})$`,
    ).exec(str);

    if (m) {
      if (!m[1] && withMask) {
        this.maskBits += 12 * 8;
        assert(this.maskBits <= 128);
      }

      // Make IPv6 address like ::ffff:x.x.x.x
      str = [
        m[1] || '::ffff:',
        ((parseInt(m[2], 10) << 8) + parseInt(m[3], 10)).toString(16),
        ':',
        ((parseInt(m[4], 10) << 8) + parseInt(m[5], 10)).toString(16),
      ].join('');
    }

    const parts = str.split('::');
    assert(parts.length <= 2);

    const bytesBlocks = parts.map((part) => {
      return part === ''
        ? []
        : part.split(':').reduce((acc, word) => {
            assert(/^[0-9a-f]{1,4}$/i.test(word));
            const p = parseInt(word, 16);
            return [...acc, p >> 8, p & 0xff];
          }, []);
    });

    if (bytesBlocks.length === 1) {
      assert(bytesBlocks[0].length === this.bytes.length);

      for (let i = 0; i < bytesBlocks[0].length; i++) {
        this.bytes[i] = bytesBlocks[0][i];
      }
    } else {
      assert(bytesBlocks[0].length + bytesBlocks[1].length < this.bytes.length);

      for (let i = 0; i < bytesBlocks[0].length; i++) {
        this.bytes[i] = bytesBlocks[0][i];
      }

      for (let i = 0; i < bytesBlocks[1].length; i++) {
        this.bytes[this.bytes.length - bytesBlocks[1].length + i] = bytesBlocks[1][i];
      }
    }

    return;
  }

  /**
   * Returns true if address is IPv4 i.e. matches the '::ffff:0:0/96' mask
   *
   * @returns {boolean}
   */
  isIP4() {
    return ip4Mask.contains(this);
  }

  /**
   * Formats address to string
   *
   * @returns {string}
   */
  toString() {
    if (this.isIP4()) {
      const mask = this.maskBits === 128 ? '' : `/${this.maskBits - 96}`;
      return (
        this.bytes
          .slice(12)
          .map((n) => n.toString(10))
          .join('.') + mask
      );
    }

    const words = [];

    for (let i = 0; i < this.bytes.length; i += 2) {
      words[i / 2] = (this.bytes[i] << 8) + this.bytes[i + 1];
    }

    // Looking for the zero-words sequence
    // with the maximum length
    let maxZStart = -1,
      maxZLength = 0;
    let zStart = -1,
      zLength = 0;

    for (let i = 0; i < words.length; i++) {
      if (words[i] === 0) {
        if (zStart < 0) {
          zStart = i;
        }

        if (++zLength > maxZLength) {
          maxZStart = zStart;
          maxZLength = zLength;
        }
      } else {
        zStart = -1;
        zLength = 0;
      }
    }

    if (maxZStart < 0) {
      // No zero blocks
      return words.map((w) => w.toString(16)).join(':');
    }

    const mask = this.maskBits === 128 ? '' : `/${this.maskBits}`;
    return (
      [
        words
          .slice(0, maxZStart)
          .map((w) => w.toString(16))
          .join(':'),
        words
          .slice(maxZStart + maxZLength)
          .map((w) => w.toString(16))
          .join(':'),
      ].join('::') + mask
    );
  }

  /**
   * Returns true if this mask contains the subj address/mask
   *
   * @param {Address} mask
   * @returns {boolean}
   */
  contains(subj) {
    if (this.maskBits > subj.maskBits) {
      return false;
    }

    const maskBytes = this.maskBits >> 3;
    const restBits = this.maskBits - (maskBytes << 3);

    for (let i = 0; i < maskBytes; i++) {
      if (subj.bytes[i] !== this.bytes[i]) {
        return false;
      }
    }

    if (restBits > 0) {
      const diffByte = subj.bytes[maskBytes] ^ this.bytes[maskBytes];

      if (diffByte >>> (8 - restBits) !== 0) {
        return false;
      }
    }

    return true;
  }
}

const ip4Mask = new Address('::ffff:0:0/96');
