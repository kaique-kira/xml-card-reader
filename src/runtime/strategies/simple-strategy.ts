import type { SchemeStrategy } from "../../interface/scheme-strategy.interface";
import type { RuntimeContext } from "../tlv-builder";

/**
 * Estratégia mínima (não-cripto) só pra validar o pipeline end-to-end.
 * Troque por implementações reais por scheme (AMEX/VISA/MC etc.) depois.
 */
export class SimpleStrategy implements SchemeStrategy {
  generateAC(context: RuntimeContext): string {
    const atcHex = context.state.atc.toString(16).padStart(4, "0").toUpperCase();
    // 8 bytes (16 hex) determinísticos
    return (atcHex + atcHex + atcHex + atcHex).slice(0, 16);
  }

  generateCID(context: RuntimeContext): string {
    // Default: ARQC (0x80) quando estiver rodando GEN AC.
    const ins = context.inputApdu.slice(2, 4).toUpperCase();
    if (ins === "AE") return "80";
    return "00";
  }

  generateIAD(context: RuntimeContext): string {
    const atcHex = context.state.atc.toString(16).padStart(4, "0").toUpperCase();
    // 4 bytes (8 hex) placeholder
    return ("060201" + atcHex).slice(0, 8);
  }

  generateSDAD(_context: RuntimeContext): string {
    // Placeholder pequeno (SDAD real costuma ser bem maior)
    return "DEADBEEFDEADBEEF";
  }
}
