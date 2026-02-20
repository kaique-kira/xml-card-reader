import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { isValidXml, parseXml, parseXmlFile } from "../index";

describe("xml-parser", () => {
  it("faz parse de um XML válido", () => {
    const xml = '<card id="123"><name>Kaique</name></card>';

    const parsed = parseXml(xml);

    expect(parsed).toEqual({
      card: {
        "@_id": "123",
        name: "Kaique",
      },
    });
  });

  it("valida XML válido e inválido", () => {
    expect(isValidXml("<root><a>1</a></root>")).toBe(true);
    expect(isValidXml("<root><a>1</root>")).toBe(false);
  });

  it("lança erro em XML inválido", () => {
    expect(() => parseXml("<root><a>1</root>")).toThrow(/XML inválido/);
  });

  it("faz parse a partir de arquivo XML", async () => {
    const folder = await mkdtemp(join(tmpdir(), "xml-card-reader-"));
    const filePath = join(folder, "sample.xml");

    await writeFile(filePath, "<nfe><numero>1001</numero></nfe>", "utf-8");

    const parsed = await parseXmlFile(filePath);

    expect(parsed).toEqual({
      nfe: {
        numero: 1001,
      },
    });
  });
});
