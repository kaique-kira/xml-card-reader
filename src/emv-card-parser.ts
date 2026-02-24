import type { ParsedXml } from "./xml-parser";
import { parseXml, parseXmlFile } from "./xml-parser";
import type { CardApduLike, CardAssetLike } from "./interface/asset.interface";

/**
 * Faz o parse de um XML EMV ("EMVCoL3CardImage") para o modelo CardAssetLike
 * contendo o cartão e todas as APDUs derivadas de Contact/Contactless.
 */
export function parseEmvCardXml(xml: string): CardAssetLike {
  const parsed = parseXml(xml);
  return buildCardAssetFromParsed(parsed);
}

/**
 * Versão baseada em arquivo do parse EMV.
 */
export async function parseEmvCardXmlFile(
  filePath: string,
): Promise<CardAssetLike> {
  const parsed = await parseXmlFile(filePath);
  return buildCardAssetFromParsed(parsed);
}

function buildCardAssetFromParsed(parsed: ParsedXml): CardAssetLike {
  const root = resolveRoot(parsed);

  const header = (root.Header ?? {}) as any;
  const features = (root.Features ?? {}) as any;
  const contact = root.Contact as any | undefined;
  const contactless = root.Contactless as any | undefined;
  const crypto = (root.Crypto ?? {}) as any;
  const magStripe = (root.MagStripe ?? {}) as any;

  const cardId = safeString(header.CardId);
  const cardVersionRaw = safeString(header.CardVersion);
  const description = normalizeDescription(header.Description);

  const author = safeString(header.Author) || undefined;
  const dateTime = safeString(header["Date-Time"]) || undefined;

  const externalDataSource = "XML_IMPORT";
  const externaDataSourceConnector =
    author || dateTime
      ? {
          source: "emv_xml",
          author,
          dateTime,
        }
      : undefined;

  const tags = buildTags(features, contact, contactless);
  const properties = buildProperties(
    features,
    crypto,
    magStripe,
    contact,
    contactless,
  );
  const apdus: CardApduLike[] = [
    ...buildApdusFromInterfaceSection(contact, "contact"),
    ...buildApdusFromInterfaceSection(contactless, "contactless"),
  ];

  const versionNumber = parseInt(
    (cardVersionRaw || "1").replace(/[^0-9]/g, "") || "1",
    10,
  );

  const asset: CardAssetLike = {
    subtype: "CARD",
    model: cardVersionRaw || cardId || "CARD",
    title: cardId || "Unknown Card",
    description,
    tags: tags.length ? tags : undefined,
    externalDataSource,
    externaDataSourceConnector,
    properties,
    version: Number.isNaN(versionNumber) ? 1 : versionNumber,
    apdus,
  };

  return asset;
}

function resolveRoot(parsed: ParsedXml): any {
  const anyParsed = parsed as any;

  if (anyParsed.EMVCoL3CardImage) {
    return anyParsed.EMVCoL3CardImage;
  }

  const keys = Object.keys(anyParsed);
  if (keys.length === 1) {
    return anyParsed[keys[0]];
  }

  throw new Error("Estrutura XML EMVCoL3CardImage não encontrada.");
}

function safeString(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizeDescription(desc: unknown): string | undefined {
  if (desc === null || desc === undefined) return undefined;
  const asString = safeString(desc);
  if (!asString) return undefined;
  return asString.replace(/\s+/g, " ").trim();
}

function toArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function firstNonAttributeKey(
  obj: Record<string, unknown>,
): string | undefined {
  return Object.keys(obj).find((k) => !k.startsWith("@_") && k !== "Tag");
}

function nodeText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }

  const obj = value as Record<string, unknown>;

  if (typeof obj["#text"] === "string" || typeof obj["#text"] === "number") {
    return String(obj["#text"]);
  }

  const key = firstNonAttributeKey(obj);
  if (key && obj[key] !== undefined) {
    return String(obj[key] as unknown as string);
  }

  return "";
}

function buildTags(features: any, contact: any, contactless: any): string[] {
  const tags = new Set<string>();

  const paymentSystem = safeString(features.PaymentSystem);
  if (paymentSystem) {
    tags.add(paymentSystem.toLowerCase());
  }

  if (contact) {
    tags.add("contact");
  }

  if (contactless) {
    tags.add("contactless");
  }

  return Array.from(tags);
}

function buildProperties(
  features: any,
  crypto: any,
  magStripe: any,
  contact: any,
  contactless: any,
): { key: string; value: any }[] {
  const properties: { key: string; value: any }[] = [];

  const paymentSystem = safeString(features.PaymentSystem);
  if (paymentSystem) {
    properties.push({ key: "paymentSystem", value: paymentSystem });
  }

  const pssd = features.PaymentSystemSpecificData;
  if (pssd) {
    const keyword = safeString(pssd["@_keyword"] ?? (pssd as any).keyword);
    const value = safeString(
      pssd["@_value"] ?? (pssd as any).value ?? nodeText(pssd),
    );
    properties.push({
      key: "paymentSystemSpecific",
      value: { keyword, value },
    });
  }

  if (contact) {
    properties.push({ key: "hasContact", value: true });
  }

  if (contactless) {
    properties.push({ key: "hasContactless", value: true });
  }

  if (crypto.PIN !== undefined) {
    properties.push({ key: "pin", value: safeString(crypto.PIN) });
  }

  if (crypto.SymmetricKeys && crypto.SymmetricKeys.Key) {
    const keys = toArray(crypto.SymmetricKeys.Key);
    const symmetric: Record<string, string> = {};

    for (const k of keys as any[]) {
      const name = safeString(k["@_name"]);
      if (!name) continue;
      const val = nodeText(k).replace(/\s+/g, "");
      if (val) symmetric[name] = val;
    }

    if (Object.keys(symmetric).length > 0) {
      properties.push({ key: "symmetricKeys", value: symmetric });
    }
  }

  if (crypto.RSAKeys) {
    const rsa: Record<string, unknown> = {};
    if (crypto.RSAKeys.CA) rsa.CA = normalizeRsaSection(crypto.RSAKeys.CA);
    if (crypto.RSAKeys.Issuer)
      rsa.Issuer = normalizeRsaSection(crypto.RSAKeys.Issuer);
    if (crypto.RSAKeys.ICC) rsa.ICC = normalizeRsaSection(crypto.RSAKeys.ICC);
    if (crypto.RSAKeys.PINEncipherment) {
      rsa.PINEncipherment = normalizeRsaSection(crypto.RSAKeys.PINEncipherment);
    }

    if (Object.keys(rsa).length > 0) {
      properties.push({ key: "rsaKeys", value: rsa });
    }
  }

  if (magStripe) {
    const track1 = safeString(magStripe.Track1);
    const track2 = safeString(magStripe.Track2);
    if (track1 || track2) {
      properties.push({ key: "magStripe", value: { track1, track2 } });
    }
  }

  return properties;
}

function normalizeRsaSection(section: any): Record<string, string> {
  const out: Record<string, string> = {};
  const fields = [
    "Modulus",
    "Exponent",
    "PrivateExponent",
    "P",
    "Q",
    "Q-1ModP",
    "ExpModP",
    "ExpModQ",
  ];

  for (const field of fields) {
    if (section[field] !== undefined) {
      out[field] = nodeText(section[field]).replace(/\s+/g, "");
    }
  }

  return out;
}

function encodeLengthEmv(length: number): string {
  if (length <= 0x7f) {
    return length.toString(16).toUpperCase().padStart(2, "0");
  }

  const hex = length.toString(16).toUpperCase();
  const byteCount = Math.ceil(hex.length / 2);
  const lenBytes = hex.padStart(byteCount * 2, "0");
  const firstByte = (0x80 | byteCount)
    .toString(16)
    .toUpperCase()
    .padStart(2, "0");
  return firstByte + lenBytes;
}

function buildTlvFromTag(tagNode: any): string {
  if (!tagNode) return "";

  const idRaw = tagNode["@_ID"];
  if (!idRaw) return "";

  const id = safeString(idRaw).replace(/\s+/g, "").toUpperCase();

  const children = tagNode.Tag;
  let valueHex = "";

  if (children !== undefined) {
    const childArray = toArray(children as any);
    valueHex = childArray.map((c) => buildTlvFromTag(c)).join("");
  } else {
    valueHex = nodeText(tagNode).replace(/\s+/g, "");
  }

  const lengthHex = encodeLengthEmv(valueHex.length / 2);
  return id + lengthHex + valueHex.toUpperCase();
}

function buildApdusFromInterfaceSection(
  section: any,
  interfaceType: "contact" | "contactless",
): CardApduLike[] {
  if (!section) return [];

  const applications = toArray(section.Application as any);
  const apdus: CardApduLike[] = [];

  for (const app of applications) {
    const aid = safeString(app["@_AID"]);
    const requests = toArray(app.TerminalRequest as any);

    for (const req of requests) {
      const name = safeString(req["@_name"]) || null;
      const cmd = safeString(req["@_cmd"]);
      const ins = safeString(req["@_ins"]);
      const p1Attr = safeString(req["@_p1"]) || "00";
      const p2Attr = safeString(req["@_p2"]) || "00";
      const cmdData = safeString(req["@_cmdData"]);

      let command: string;
      if (name === "ReadRecord") {
        const sfi = safeString(req["@_sfi"]) || "01";
        const record = safeString(req["@_record"]) || "01";
        command = buildReadRecordCommand(sfi, record);
      } else {
        command = `${cmd}${ins}${p1Attr}${p2Attr}`.toUpperCase();
      }

      const exprParts: string[] = [];
      exprParts.push(`interface='${interfaceType}'`);
      if (aid) exprParts.push(`aid='${aid}'`);
      if (name) exprParts.push(`name='${name}'`);

      const sfiAttr = safeString(req["@_sfi"]);
      if (sfiAttr) exprParts.push(`sfi='${sfiAttr}'`);

      const recordAttr = safeString(req["@_record"]);
      if (recordAttr) exprParts.push(`record='${recordAttr}'`);

      const instanceAttr = safeString(req["@_instance"]);
      if (instanceAttr) exprParts.push(`instance='${instanceAttr}'`);

      if (cmdData) exprParts.push(`cmdData='${cmdData}'`);

      const expr = exprParts.length ? exprParts.join(" and ") : null;

      const cardResponse = req.CardResponse as any;
      let response: string | null = null;
      let responseType: "TLV" | "RAW" | null = null;
      let sw = "9000";

      if (cardResponse) {
        if (cardResponse["@_sw"]) {
          sw = safeString(cardResponse["@_sw"]) || "9000";
        }

        if (cardResponse.Tag !== undefined) {
          const tags = toArray(cardResponse.Tag as any);
          response = tags.map((t) => buildTlvFromTag(t)).join("");
          responseType = "TLV";
        } else {
          const raw = nodeText(cardResponse).replace(/\s+/g, "");
          if (raw) {
            response = raw.toUpperCase();
            responseType = "RAW";
          }
        }
      }

      apdus.push({
        name,
        command,
        expr,
        response,
        responseType,
        sw,
      });
    }
  }

  return apdus;
}

function buildReadRecordCommand(sfiHex: string, recordHex: string): string {
  const cla = "00";
  const ins = "B2";
  const record = recordHex.padStart(2, "0").toUpperCase();
  const sfi = parseInt(sfiHex || "1", 16);
  const p2 = ((sfi << 3) | 0x04).toString(16).toUpperCase().padStart(2, "0");
  const le = "00";

  return `${cla}${ins}${record}${p2}${le}`;
}
