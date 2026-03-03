// src/compiler/emv-xml-compiler.ts
import type { ParsedXml } from "../xml-parser";
import { parseXml, parseXmlFile } from "../xml-parser";
import type {
  CompiledAid,
  CompiledApdu,
  CompiledCardModel,
  CompiledSymmetricKeys,
  CompiledTemplate,
  CompiledTag,
  SchemeType,
} from "../interface/asset.interface";

export function compileEmvCardXml(xml: string): CompiledCardModel {
  const parsed = parseXml(xml);
  return buildCompiledModel(parsed);
}

export async function compileEmvCardXmlFile(
  filePath: string,
): Promise<CompiledCardModel> {
  const parsed = await parseXmlFile(filePath);
  return buildCompiledModel(parsed);
}

function buildCompiledModel(parsed: ParsedXml): CompiledCardModel {
  const root = resolveRoot(parsed);

  const features = (root.Features ?? {}) as any;
  const crypto = (root.Crypto ?? {}) as any;

  const scheme = mapSchemeFromPaymentSystem(features?.PaymentSystem);

  const symmetric = extractSymmetricKeys(crypto);
  const rsa = extractRsaKeySet(crypto);

  const aids: CompiledAid[] = [];

  // Contact + Contactless (se existirem)
  const sections = [root.Contact, root.Contactless].filter(Boolean);

  for (const section of sections as any[]) {
    const applications = toArray(section.Application);

    for (const app of applications) {
      const aidHex = normalizeHex(app?.["@_AID"] ?? app?.AID ?? "");
      if (!aidHex) continue;

      const terminalRequests = toArray(app.TerminalRequest);

      const apdus: CompiledApdu[] = [];
      let cdol1 = "";
      let cdol2: string | undefined;
      let ddol: string | undefined;

      for (const req of terminalRequests) {
        const compiled = compileTerminalRequest(req);
        apdus.push(compiled);

        // 🔎 Extrai CDOL/DDOL de dentro dos responses (via XML)
        // Normalmente aparecem em ReadRecord.
        const responseTags = collectAllTags(req?.CardResponse?.Tag);
        for (const t of responseTags) {
          const tagId = normalizeTagId(t?.["@_ID"]);
          const v = normalizeHex(nodeText(t));
          if (!tagId || !v) continue;

          if (tagId === "8C" && !cdol1) cdol1 = v;
          if (tagId === "8D" && !cdol2) cdol2 = v;
          if (tagId === "9F49" && !ddol) ddol = v;
        }
      }

      // Se cdol1 não existir no XML, mantém vazio (mas NÃO undefined)
      const compiledAid: CompiledAid = {
        aid: aidHex,
        scheme,
        apdus,
        cdol1,
        cdol2,
        ddol,
        keys: {
          symmetric,
          rsa,
        },
      };

      // label (se existir em algum Select response 50)
      const label = findFirstTagValue(app, "50");
      if (label) compiledAid.label = label;

      aids.push(compiledAid);
    }
  }

  return { aids };
}

function compileTerminalRequest(req: any): CompiledApdu {
  const name = safeString(req?.["@_name"]);

  const cla = normalizeHex(req?.["@_cmd"] ?? "");
  const ins = normalizeHex(req?.["@_ins"] ?? "");
  const p1 = normalizeHex(req?.["@_p1"] ?? "");
  const p2 = normalizeHex(req?.["@_p2"] ?? "");

  const behavior = mapBehavior(name, ins);

  const match: "CLA_INS" | "FULL_HEADER" =
    behavior === "GENERATE_AC" ? "CLA_INS" : "FULL_HEADER";

  const instanceRaw = safeString(req?.["@_instance"]);
  const instance = instanceRaw ? Number(instanceRaw) : undefined;

  const sw = normalizeHex(req?.CardResponse?.["@_sw"] ?? "9000") || "9000";

  // Response pode ser:
  // - Tag (TLV estruturado)
  // - texto raw
  const cardResponse = req?.CardResponse;
  const rootTag = cardResponse?.Tag;

  let template: CompiledTemplate | undefined;

  if (rootTag) {
    template = compileResponseTemplate(rootTag);
  }

  return {
    cla: cla || "00",
    ins: ins || "00",
    p1: p1 || undefined,
    p2: p2 || undefined,
    match,
    behavior,
    template,
    sw,
    instance,
  };
}

function compileResponseTemplate(tagNode: any): CompiledTemplate {
  const templateTag = normalizeTagId(tagNode?.["@_ID"]) || "";

  const children = toArray(tagNode?.Tag);

  const compiledChildren: CompiledTag[] = [];

  for (const child of children) {
    const tag = normalizeTagId(child?.["@_ID"]);
    if (!tag) continue;

    const raw = nodeText(child);

    // Se tiver filhos, a gente “fixa” tudo como STATIC TLV pronto
    // (porque o runtime que importa mesmo é 80/77 de GenAC).
    // Isso simplifica MUITO o compiler agora.
    if (child?.Tag !== undefined) {
      const tlvHex = buildTlvFromXml(child);
      compiledChildren.push({
        type: "STATIC",
        tag,
        value: tlvHex.slice(tag.length + 2),
      });
      // ^ cuidado: aqui a gente está guardando só "value".
      // O builder vai re-encodar length, então value precisa ser o VALUE puro do tag.
      // buildTlvFromXml retorna TAG+LEN+VALUE, então:
      // remove TAG + LEN (LEN pode variar). Então vamos fazer direito abaixo.
      compiledChildren.pop();
      const valueOnly = extractValueFromBuiltTlv(buildTlvFromXml(child), tag);
      compiledChildren.push({ type: "STATIC", tag, value: valueOnly });
      continue;
    }

    const parsed = parseRuntimeOrStaticValue(raw);

    if (parsed.kind === "RUNTIME") {
      compiledChildren.push({
        type: "RUNTIME",
        tag,
        resolver: parsed.resolver,
        params: parsed.params,
      });
    } else {
      compiledChildren.push({
        type: "STATIC",
        tag,
        value: parsed.value,
      });
    }
  }

  return {
    tag: templateTag,
    children: compiledChildren,
  };
}

function parseRuntimeOrStaticValue(
  raw: unknown,
):
  | { kind: "STATIC"; value: string }
  | { kind: "RUNTIME"; resolver: any; params?: any } {
  const text = safeString(raw);

  // Normaliza "06 02 01 [emvcard.iad(4)]" → prefixo + runtime
  // Por agora: se tiver runtime no meio, a gente transforma isso em STATIC (prefixo) + RUNTIME (resto)
  // MAS como CompiledTag é 1 por tag, vamos resolver assim:
  // - se houver prefixo antes do runtime, ele entra como params.prefix no runtime.
  // - runtime devolve prefix+valor.
  const runtimeMatch = text.match(/\[(emvcard\.[a-z0-9_]+)(\(([^)]*)\))?\]/i);
  if (!runtimeMatch) {
    return { kind: "STATIC", value: normalizeHex(text) };
  }

  const before = normalizeHex(text.slice(0, runtimeMatch.index ?? 0));
  const fn = runtimeMatch[1].toLowerCase(); // emvcard.iad
  const argStr = runtimeMatch[3]; // "4" ou "x,y"

  const params: any = {};
  if (before) params.prefix = before;
  if (argStr) params.args = argStr.split(",").map((s) => s.trim());

  // Mapeia emvcard.xxx → RuntimeResolver
  switch (fn) {
    case "emvcard.atc":
      return { kind: "RUNTIME", resolver: "ATC", params };
    case "emvcard.appcrypto":
      return { kind: "RUNTIME", resolver: "AC", params };
    case "emvcard.arqc":
    case "emvcard.term":
      return { kind: "RUNTIME", resolver: "CID", params };
    case "emvcard.iad":
      return { kind: "RUNTIME", resolver: "IAD", params };
    case "emvcard.sdad":
      return { kind: "RUNTIME", resolver: "SDAD", params };
    default:
      // fallback: trata como STATIC “limpo”, pra não quebrar importação
      return { kind: "STATIC", value: normalizeHex(text) };
  }
}

/**
 * === Helpers (iguais/parecidos com os seus do parser atual) ===
 */

function resolveRoot(parsed: ParsedXml): any {
  const anyParsed = parsed as any;
  if (anyParsed.EMVCoL3CardImage) return anyParsed.EMVCoL3CardImage;

  const keys = Object.keys(anyParsed);
  if (keys.length === 1) return anyParsed[keys[0]];
  throw new Error("Estrutura XML EMVCoL3CardImage não encontrada.");
}

function mapSchemeFromPaymentSystem(paymentSystem: unknown): SchemeType {
  const v = safeString(paymentSystem).toLowerCase();
  if (v.includes("american express") || v.includes("amex")) return "AMEX";
  if (v.includes("mastercard")) return "MASTERCARD";
  if (v.includes("visa")) return "VISA";
  if (v.includes("discover")) return "DISCOVER";
  if (v.includes("elo")) return "ELO";
  // default seguro
  return "AMEX";
}

function mapBehavior(name: string, ins: string) {
  const insUp = (ins || "").toUpperCase();
  if (insUp === "AE") return "GENERATE_AC";
  if (insUp === "88") return "INTERNAL_AUTH";
  if (insUp === "A8") return "GET_PROCESSING_OPTIONS";
  if (insUp === "B2") return "READ_RECORD";
  return "STATIC";
}

function extractSymmetricKeys(crypto: any): CompiledSymmetricKeys {
  const out: CompiledSymmetricKeys = { mkac: "" };

  const keys = toArray(crypto?.SymmetricKeys?.Key);
  for (const k of keys as any[]) {
    const name = safeString(k?.["@_name"]).toUpperCase();
    const val = normalizeHex(nodeText(k));
    if (!name || !val) continue;

    if (name === "MKAC") out.mkac = val;
    if (name === "MKSMI") out.mksmi = val;
    if (name === "MKSMC") out.mksmc = val;
  }

  return out;
}

function extractRsaKeySet(crypto: any) {
  // No seu modelo atual RsaKeySet é 1 set só.
  // Por enquanto pegamos ICC se existir, senão Issuer, senão CA.
  const rsa = crypto?.RSAKeys;
  const pick = rsa?.ICC ?? rsa?.Issuer ?? rsa?.CA;
  if (!pick) return undefined;

  const modulus = normalizeHex(nodeText(pick?.Modulus));
  const exponent = normalizeHex(nodeText(pick?.Exponent));
  const privateExponent = normalizeHex(nodeText(pick?.PrivateExponent));

  if (!modulus || !exponent) return undefined;

  return {
    modulus,
    exponent,
    privateExponent: privateExponent || undefined,
  };
}

function findFirstTagValue(app: any, tagId: string): string | undefined {
  const trs = toArray(app?.TerminalRequest);
  for (const tr of trs) {
    const tags = collectAllTags(tr?.CardResponse?.Tag);
    for (const t of tags) {
      if (normalizeTagId(t?.["@_ID"]) === tagId) {
        // label é ISO-8859-1, mas o valor no XML vem em texto (ex: AMERICAN EXPRESS)
        // guardamos como string normal
        const v = safeString(nodeText(t));
        if (v && /[a-z]/i.test(v)) return v;
      }
    }
  }
  return undefined;
}

function collectAllTags(tagOrTags: any): any[] {
  const out: any[] = [];
  const stack = toArray(tagOrTags);

  while (stack.length) {
    const cur = stack.shift();
    if (!cur) continue;
    out.push(cur);

    if (cur.Tag !== undefined) {
      stack.push(...toArray(cur.Tag));
    }
  }

  return out;
}

function buildTlvFromXml(tagNode: any): string {
  const tag = normalizeTagId(tagNode?.["@_ID"]);
  if (!tag) return "";

  const children = tagNode?.Tag;
  let valueHex = "";

  if (children !== undefined) {
    valueHex = toArray(children)
      .map((c: any) => buildTlvFromXml(c))
      .join("");
  } else {
    const format = safeString(tagNode?.["@_format"]).toUpperCase();
    const text = safeString(nodeText(tagNode));

    if (format === "ISO-8859-1") {
      valueHex = Buffer.from(text, "latin1").toString("hex").toUpperCase();
    } else {
      const pseudo = text.match(/^0\.([0-9a-fA-F]{2})$/);
      if (pseudo) valueHex = pseudo[1].toUpperCase();
      else valueHex = text.replace(/[^0-9a-fA-F]/g, "").toUpperCase();
    }
  }

  const len = encodeLength(valueHex.length / 2);
  return `${tag}${len}${valueHex}`;
}

function extractValueFromBuiltTlv(tlv: string, tag: string): string {
  // tlv = TAG + LEN + VALUE
  // LEN pode ser 1 ou mais bytes (81/82...).
  const t = tag.toUpperCase();
  if (!tlv.startsWith(t)) return "";

  const afterTag = tlv.slice(t.length);
  const firstLenByte = parseInt(afterTag.slice(0, 2), 16);
  if (Number.isNaN(firstLenByte)) return "";

  if (firstLenByte <= 0x7f) {
    const valueStart = 2;
    return afterTag.slice(valueStart);
  }

  const bytesCount = firstLenByte & 0x7f;
  const valueStart = 2 + bytesCount * 2;
  return afterTag.slice(valueStart);
}

function encodeLength(length: number): string {
  if (length <= 0x7f) return length.toString(16).toUpperCase().padStart(2, "0");

  const hex = length.toString(16).toUpperCase();
  const byteCount = Math.ceil(hex.length / 2);
  const lenBytes = hex.padStart(byteCount * 2, "0");
  const firstByte = (0x80 | byteCount)
    .toString(16)
    .toUpperCase()
    .padStart(2, "0");
  return firstByte + lenBytes;
}

function toArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function safeString(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
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
  return "";
}

function normalizeHex(input: unknown): string {
  const s = safeString(input);
  if (!s) return "";
  return s.replace(/[^0-9a-fA-F]/g, "").toUpperCase();
}

function normalizeTagId(input: unknown): string {
  return normalizeHex(input);
}
