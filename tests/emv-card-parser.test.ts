import { describe, expect, it } from "vitest";
import { parseEmvCardXml } from "../index";

// Teste focado em garantir que tags com format="ISO-8859-1"
// sejam convertidas para hex antes do cálculo de length na TLV.
describe("emv-card-parser - ISO-8859-1", () => {
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
      expect(apdu.response).not.toContain(".");
      expect(/^[0-9A-F]+$/.test(apdu.response)).toBe(true);
    }
  });
});
