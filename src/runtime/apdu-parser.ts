// APDU PARSER (EMV compliant)
// Suporta Case 1,2,3,4 + Extended Length

export interface ParsedApdu {
  cla: string;
  ins: string;
  p1: string;
  p2: string;

  lc?: number;
  data?: string;
  le?: number;

  raw: string;
}

export class ApduParser {
  static parse(apduHex: string): ParsedApdu {
    const normalized = apduHex.toUpperCase();
    const bytes = this.hexToBytes(normalized);

    if (bytes.length < 4) {
      throw new Error("APDU inválido: menor que 4 bytes");
    }

    const cla = normalized.slice(0, 2);
    const ins = normalized.slice(2, 4);
    const p1 = normalized.slice(4, 6);
    const p2 = normalized.slice(6, 8);

    // Se só tem 4 bytes → Case 1
    if (bytes.length === 4) {
      return { cla, ins, p1, p2, raw: normalized };
    }

    // A partir daqui temos pelo menos Lc ou Le
    let index = 4;

    const firstLengthByte = bytes[index];

    // EXTENDED LENGTH (0x00)
    if (firstLengthByte === 0x00) {
      if (bytes.length < 7) {
        throw new Error("APDU extended inválido");
      }

      const extendedLc = (bytes[index + 1] << 8) | bytes[index + 2];

      index += 3;

      // Case 2E → extended Le only
      if (bytes.length === 7) {
        const le = (bytes[index] << 8) | bytes[index + 1];

        return {
          cla,
          ins,
          p1,
          p2,
          le,
          raw: normalized,
        };
      }

      // Case 3E / 4E
      const dataBytes = bytes.slice(index, index + extendedLc);
      const data = this.bytesToHex(dataBytes);

      index += extendedLc;

      let le: number | undefined;

      if (bytes.length > index) {
        le = (bytes[index] << 8) | bytes[index + 1];
      }

      return {
        cla,
        ins,
        p1,
        p2,
        lc: extendedLc,
        data,
        le,
        raw: normalized,
      };
    }

    // SHORT LENGTH

    const lc = firstLengthByte;
    index += 1;

    // Case 2 → only Le
    if (bytes.length === 5) {
      return {
        cla,
        ins,
        p1,
        p2,
        le: lc,
        raw: normalized,
      };
    }

    // Case 3 / 4
    const dataBytes = bytes.slice(index, index + lc);
    const data = this.bytesToHex(dataBytes);

    index += lc;

    let le: number | undefined;

    if (bytes.length > index) {
      le = bytes[index];
    }

    return {
      cla,
      ins,
      p1,
      p2,
      lc,
      data,
      le,
      raw: normalized,
    };
  }

  private static hexToBytes(hex: string): number[] {
    const bytes: number[] = [];

    for (let i = 0; i < hex.length; i += 2) {
      bytes.push(parseInt(hex.substr(i, 2), 16));
    }

    return bytes;
  }

  private static bytesToHex(bytes: number[]): string {
    return bytes
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase();
  }
}
