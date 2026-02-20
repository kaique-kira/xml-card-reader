import { readFile } from "node:fs/promises";
import { XMLParser, XMLValidator, type X2jOptions } from "fast-xml-parser";

export type ParsedXml = Record<string, unknown>;

export interface ParseXmlOptions {
  parserOptions?: Partial<X2jOptions>;
}

const defaultParserOptions: Partial<X2jOptions> = {
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: true,
  trimValues: true,
};

function assertXmlInput(xml: string): void {
  if (typeof xml !== "string" || xml.trim().length === 0) {
    throw new Error("XML de entrada é obrigatório e não pode estar vazio.");
  }
}

function assertValidXml(xml: string): void {
  const validationResult = XMLValidator.validate(xml);
  if (validationResult !== true) {
    const error = validationResult.err;
    throw new Error(
      `XML inválido na linha ${error.line}, coluna ${error.col}: ${error.msg}`,
    );
  }
}

export function parseXml(
  xml: string,
  options: ParseXmlOptions = {},
): ParsedXml {
  assertXmlInput(xml);
  assertValidXml(xml);

  const parser = new XMLParser({
    ...defaultParserOptions,
    ...options.parserOptions,
  });

  return parser.parse(xml) as ParsedXml;
}

export async function parseXmlFile(
  filePath: string,
  options: ParseXmlOptions = {},
): Promise<ParsedXml> {
  if (!filePath || filePath.trim().length === 0) {
    throw new Error("O caminho do arquivo XML é obrigatório.");
  }

  const xmlContent = await readFile(filePath, "utf-8");
  return parseXml(xmlContent, options);
}

export function isValidXml(xml: string): boolean {
  assertXmlInput(xml);
  return XMLValidator.validate(xml) === true;
}
