// CDOL PARSER (EMV compliant)
// Interpreta CDOL1 / CDOL2 e extrai valores do APDU
export interface CdolDefinitionEntry {
  tag: string;
  length: number;
}

export type ParsedCdolData = Record<string, string>;

export class CdolParser {
  // Parse definição CDOL (hex vindo do modelo)
  // Ex: "9F02069F03069F1A0295055F2A029A039C019F3704"

  static parseDefinition(hex: string): CdolDefinitionEntry[] {
    const bytes = this.hexToBytes(hex);
    const entries: CdolDefinitionEntry[] = [];

    let index = 0;

    while (index < bytes.length) {
      const { tag, tagLength } = this.readTag(bytes, index);
      index += tagLength;

      const length = bytes[index];
      index += 1;

      entries.push({
        tag,
        length,
      });
    }

    return entries;
  }

  // Extrai valores do APDU data baseado na definição

  static extractData(
    definition: CdolDefinitionEntry[],
    dataHex: string,
  ): ParsedCdolData {
    const dataBytes = this.hexToBytes(dataHex);

    let index = 0;

    const result: ParsedCdolData = {};

    for (const entry of definition) {
      const valueBytes = dataBytes.slice(index, index + entry.length);

      if (valueBytes.length !== entry.length) {
        throw new Error(`CDOL data insuficiente para tag ${entry.tag}`);
      }

      result[entry.tag] = this.bytesToHex(valueBytes);

      index += entry.length;
    }

    if (index !== dataBytes.length) {
      throw new Error("CDOL data contém bytes extras inesperados");
    }

    return result;
  }

  // Helpers

  private static readTag(bytes: number[], index: number) {
    const firstByte = bytes[index];

    // Tag multi-byte?
    if ((firstByte & 0x1f) === 0x1f) {
      const secondByte = bytes[index + 1];

      return {
        tag: this.byteToHex(firstByte) + this.byteToHex(secondByte),
        tagLength: 2,
      };
    }

    return {
      tag: this.byteToHex(firstByte),
      tagLength: 1,
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

  private static byteToHex(byte: number): string {
    return byte.toString(16).padStart(2, "0").toUpperCase();
  }
}
