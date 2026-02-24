import { createCipheriv } from "node:crypto";

export interface TlvField {
  field: string;
  value: string;
  size: number; // total size in hex characters consumed from the input
}

export function decodeField(
  input: string,
  format: string,
): TlvField[] | undefined {
  if (format === "tlvemv") {
    return decodeTlvEmv(input);
  }
  return undefined;
}

// ISO/IEC 8825 TLV decode for EMV data
export function decodeTlvEmv(input: string): TlvField[] {
  const result: TlvField[] = [];
  let offset = 0;

  while (offset < input.length) {
    let size = 0;

    const tag = decodeTagEmv(input, offset);
    offset += tag.length;
    size += tag.length;

    const length = decodeLengthEmv(input, offset);
    offset += length.size * 2;
    size += length.size * 2;

    const value = input.substr(offset, length.value * 2);
    offset += value.length;
    size += value.length;

    result.push({
      field: tag,
      value,
      size,
    });
  }

  return result;
}

function decodeTagEmv(input: string, startOffset: number): string {
  let offset = startOffset;
  let tag = input.substr(offset, 2);
  offset += 2;

  if ((parseInt(tag, 16) & 0x1f) === 0x1f) {
    // subsequent tag bytes while high bit is set
    for (let follows = true; follows; ) {
      const byte = input.substr(offset, 2);
      follows = (parseInt(byte, 16) & 0x80) === 0x80;
      tag += byte;
      offset += 2;
    }
  }

  return tag;
}

function decodeLengthEmv(
  input: string,
  startOffset: number,
): { value: number; size: number } {
  let offset = startOffset;
  let length = parseInt(input.substr(offset, 2), 16);
  let size = 1;
  offset += 2;

  if (length & 0x80) {
    size = length & 0x7f;
    length = parseInt(input.substr(offset, size * 2), 16);
  }

  return { value: length, size };
}

function padMsgIso(msg: string): string {
  let result = msg;
  let first = true;
  while ((result.length / 2) % 8) {
    if (first) result += "80";
    else result += "00";
    first = false;
  }
  return result;
}

function xorHexStr(a: string, b: string): string {
  if (a.length !== b.length) {
    throw new Error("xorHexStr: inputs must have the same length");
  }

  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  const out = Buffer.alloc(bufA.length);

  for (let i = 0; i < bufA.length; i++) {
    out[i] = bufA[i] ^ bufB[i];
  }

  return out.toString("hex").toUpperCase();
}

function isHex(str: string): boolean {
  return /^[0-9a-fA-F]+$/.test(str);
}

function incHexStr(hex: string): string {
  const value = BigInt("0x" + hex);
  const incremented = value + 1n;
  const padded = incremented
    .toString(16)
    .toUpperCase()
    .padStart(hex.length, "0");
  return padded.slice(-hex.length);
}

export function generateSessionKeyAC_3des(
  mk: string,
  atc: string,
  un: string,
): string {
  const algo = "des-ede3-cbc";
  const key = Buffer.from(mk + mk.substring(0, 16), "hex");
  const iv = Buffer.alloc(8, 0);

  const part1 = createCipheriv(algo, key, iv).update(
    atc + "F000" + un,
    "hex",
    "hex",
  );
  const part2 = createCipheriv(algo, key, iv).update(
    atc + "0F00" + un,
    "hex",
    "hex",
  );

  return part1 + part2;
}

export function generateARPC_3des_method1(
  sk: string,
  ac: string,
  arc: string,
): string {
  const algo = "des-ede3-cbc";
  const key = Buffer.from(sk + sk.substring(0, 16), "hex");
  const iv = Buffer.alloc(8, 0);
  const data = arc + "000000000000";

  return createCipheriv(algo, key, iv).update(
    xorHexStr(ac, data),
    "hex",
    "hex",
  );
}

export function generateSessionKeyMAC_3des(mk: string, ac: string): string {
  const algo = "des-ede3-cbc";
  const key = Buffer.from(mk + mk.substring(0, 16), "hex");
  const iv = Buffer.alloc(8, 0);

  const part1 = createCipheriv(algo, key, iv).update(
    ac.substr(0, 4) + "F0" + ac.substr(6, 10),
    "hex",
    "hex",
  );
  const part2 = createCipheriv(algo, key, iv).update(
    ac.substr(0, 4) + "0F" + ac.substr(6, 10),
    "hex",
    "hex",
  );

  return part1 + part2;
}

export function generateMAC_3des(sk: string, msg: string): string {
  const ek = Buffer.from(sk.substr(0, 16), "hex");
  const edek = Buffer.from(sk + sk.substring(0, 16), "hex");
  const iv = Buffer.alloc(8, 0);
  const buff = padMsgIso(msg);
  let index = 0;
  let block = "0000000000000000";

  while (index < buff.length) {
    block = xorHexStr(block, buff.substr(index, 16));
    index += 16;
    if (index < buff.length) {
      block = createCipheriv("des", ek, iv).update(block, "hex", "hex");
    } else {
      block = createCipheriv("des-ede3-cbc", edek, iv).update(
        block,
        "hex",
        "hex",
      );
    }
  }

  return block;
}

export interface MacInput {
  apdu: string;
  atc: string;
  ac: string;
  sk?: string;
  mk?: string; // equivalente a MK_SMI/MK
  rand?: string;
}

export interface MacResult {
  apduWithMac: string;
  nextRand: string;
}

// Implementa a lógica legada do handler "mac":
// - valida APDU, ATC, AC (hex / tamanhos)
// - usa RAND (se informado) ou AC
// - usa SK se fornecido; senão deriva SK com MK via generateSessionKeyMAC_3des
// - calcula MAC 3DES sobre (APDU || ATC || RAND)
// - incrementa RAND em hexa
export function generateApduWithMac(input: MacInput): MacResult {
  const { apdu, atc, ac, sk, mk, rand } = input;

  if (!isHex(apdu) || apdu.length % 2 !== 0 || apdu.length < 10) {
    throw new Error(`Invalid value hex5~n for parameter apdu: "${apdu}"`);
  }

  if (!atc || !isHex(atc) || atc.length !== 4) {
    throw new Error(`Invalid value hex2 for parameter atc: "${atc}"`);
  }

  if (!ac || !isHex(ac) || ac.length !== 16) {
    throw new Error(`Invalid value hex8 for parameter ac: "${ac}"`);
  }

  const effectiveRand = rand && rand.length > 0 ? rand : ac;

  let sessionKey = sk;

  if (sessionKey) {
    if (!isHex(sessionKey) || sessionKey.length !== 32) {
      throw new Error(`Invalid value hex16 for parameter sk: "${sessionKey}"`);
    }
  } else {
    if (!mk) {
      throw new Error("Missing property mk (MK_SMI/MK)");
    }
    if (!isHex(mk) || mk.length !== 32) {
      throw new Error(
        `Invalid value hex16 for property mk (MK_SMI/MK): "${mk}"`,
      );
    }

    // No legado: generateSessionKeyMAC_3des(mk, rand)
    sessionKey = generateSessionKeyMAC_3des(mk, effectiveRand);
  }

  const mac = generateMAC_3des(sessionKey, apdu + atc + effectiveRand);
  const nextRand = incHexStr(effectiveRand);

  return {
    apduWithMac: apdu + mac,
    nextRand,
  };
}
