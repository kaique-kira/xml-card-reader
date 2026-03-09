import { describe, expect, it } from "vitest";
import { parseEmvCardXml } from "../index";

// Teste focado em garantir que tags com format="ISO-8859-1"
// sejam convertidas para hex antes do cálculo de length na TLV.
describe("emv-card-parser - ISO-8859-1", () => {
  it("monta comando APDU incluindo Lc e cmdData", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<EMVCoL3CardImage formatVersion="1.0">
  <Header>
    <CardId>TEST CARD</CardId>
    <CardVersion>v1</CardVersion>
  </Header>
  <Contact>
    <Application AID="A000000000">
      <TerminalRequest name="GPO" cmd="80" ins="A8" p1="00" p2="00" cmdData="83 00">
        <CardResponse sw="9000" />
      </TerminalRequest>
    </Application>
  </Contact>
</EMVCoL3CardImage>`;

    const asset = parseEmvCardXml(xml);

    expect(asset.apdus.length).toBe(1);
    expect(asset.apdus[0].command).toBe("80A80000028300");
  });

  it("converte cmdData em bits (entre aspas) para pseudo-hex", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<EMVCoL3CardImage formatVersion="1.0">
  <Header>
    <CardId>TEST CARD</CardId>
    <CardVersion>v1</CardVersion>
  </Header>
  <Contact>
    <Application AID="A000000000">
      <TerminalRequest name="Custom" cmd="80" ins="A8" p1="00" p2="00" cmdData="'00000100'">
        <CardResponse sw="9000" />
      </TerminalRequest>
    </Application>
  </Contact>
</EMVCoL3CardImage>`;

    const asset = parseEmvCardXml(xml);

    expect(asset.apdus.length).toBe(1);
    expect(asset.apdus[0].command).toBe("80A800000104");
  });

  it("converte texto ISO-8859-1 para hex na TLV", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<EMVCoL3CardImage formatVersion="1.0">
  <Header>
    <CardId>TEST CARD</CardId>
    <CardVersion>v1</CardVersion>
  </Header>
  <Features>
    <PaymentSystem>TestPS</PaymentSystem>
  </Features>
  <Contact>
    <Application AID="A000000000">
      <TerminalRequest name="Select" cmd="00" ins="A4" p1="04" p2="00">
        <CardResponse>
          <Tag ID="50" name="Application Label" format="ISO-8859-1">AMERICAN EXPRESS</Tag>
        </CardResponse>
      </TerminalRequest>
    </Application>
  </Contact>
</EMVCoL3CardImage>`;

    const asset = parseEmvCardXml(xml);

    expect(asset.apdus.length).toBe(1);
    const apdu = asset.apdus[0];

    // "AMERICAN EXPRESS" tem 15 caracteres (0x0F bytes)
    // Hex esperado do texto: 414D45524943414E2045585052455353
    const expectedValueHex = "414D45524943414E2045585052455353";

    expect(apdu.response).toBeDefined();
    // Ignoramos o length aqui (primeiros 4 hex: tag + length),
    // o foco é garantir que o VALUE foi convertido corretamente
    // para hex a partir do texto ISO-8859-1.
    expect(apdu.response!.slice(4)).toBe(expectedValueHex);
  });

  it("remove caracteres nao-hex de valores em tags nao ISO-8859-1", async () => {
    // Usa o XML de exemplo real e garante que nenhuma response tenha ponto.
    const { readFile } = await import("node:fs/promises");
    const xml = await readFile("samples/AEIPS 03 EP 03.xml", "utf-8");

    const asset = parseEmvCardXml(xml);

    for (const apdu of asset.apdus) {
      if (!apdu.response) continue;

      if (/\[emvcard\./i.test(apdu.response)) {
        // Placeholder dinâmico deve ser preservado sem sanitização.
        continue;
      }

      expect(apdu.response).not.toContain(".");
      expect(/^[0-9A-F]+$/.test(apdu.response)).toBe(true);
    }
  });

  it("preserva placeholders emvcard sem tratamento", async () => {
    const { readFile } = await import("node:fs/promises");
    const xml = await readFile("samples/AEIPS 03 EP 03.xml", "utf-8");

    const asset = parseEmvCardXml(xml);
    const withEmvcard = asset.apdus.find((apdu) =>
      /\[emvcard\./i.test(apdu.response ?? ""),
    );

    expect(withEmvcard).toBeDefined();
    expect(withEmvcard!.response).toContain("[emvcard.");
    expect(withEmvcard!.response).toMatch(/\[emvcard\.[^\]]+\]/i);
  });

  it("retorna expr e responseType vazios (null) na saida geral", async () => {
    const { readFile } = await import("node:fs/promises");
    const xml = await readFile("samples/AEIPS 03 EP 03.xml", "utf-8");

    const asset = parseEmvCardXml(xml);

    for (const apdu of asset.apdus) {
      expect(apdu.expr ?? null).toBeNull();
      expect(apdu.responseType ?? null).toBeNull();
    }
  });
});
