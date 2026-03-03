import {
  CompiledAid,
  CompiledApdu,
  CompiledTag,
  CompiledTemplate,
} from "../interface/asset.interface";
import { CdolParser } from "./cdol-parser";
import { SchemeStrategy } from "../interface/scheme-strategy.interface";

import { CardRuntimeState, RuntimeContext, TlvBuilder } from "./tlv-builder";

import { ApduParser, ParsedApdu } from "./apdu-parser";

export class EmvCardEngine {
  constructor(
    private aid: CompiledAid,
    private state: CardRuntimeState,
    private strategy: SchemeStrategy,
  ) {}
  // PROCESS APDU (ENGINE ENTRY POINT)
  processApdu(apduHex: string) {
    const parsed = ApduParser.parse(apduHex);

    const matchedApdu = this.matchApdu(parsed);

    if (!matchedApdu) {
      return {
        response: "",
        sw: "6D00",
        newState: this.state,
      };
    }

    switch (matchedApdu.behavior) {
      case "STATIC":
        return this.processStatic(matchedApdu);

      case "GENERATE_AC":
        return this.processGenerateAc(parsed, matchedApdu);

      case "GET_PROCESSING_OPTIONS":
        return this.processStatic(matchedApdu);

      case "READ_RECORD":
        return this.processStatic(matchedApdu);

      case "INTERNAL_AUTH":
        return this.processStatic(matchedApdu);

      default:
        return {
          response: "",
          sw: "6D00",
          newState: this.state,
        };
    }
  }
  // MATCH APDU
  private matchApdu(parsed: ParsedApdu): CompiledApdu | undefined {
    return this.aid.apdus.find((a) => {
      if (a.match === "CLA_INS") {
        return (
          a.cla.toUpperCase() === parsed.cla &&
          a.ins.toUpperCase() === parsed.ins
        );
      }

      // FULL_HEADER
      return (
        a.cla.toUpperCase() === parsed.cla &&
        a.ins.toUpperCase() === parsed.ins &&
        (a.p1?.toUpperCase() ?? "") === parsed.p1 &&
        (a.p2?.toUpperCase() ?? "") === parsed.p2
      );
    });
  }
  // STATIC RESPONSE
  private processStatic(apdu: CompiledApdu) {
    if (!apdu.template) {
      return {
        response: "",
        sw: apdu.sw,
        newState: this.state,
      };
    }

    const tlv = TlvBuilder.buildTemplate(apdu.template, () => "");

    return {
      response: tlv,
      sw: apdu.sw,
      newState: this.state,
    };
  }
  // GENERATE AC
  private processGenerateAc(parsed: ParsedApdu, apdu: CompiledApdu) {
    if (!apdu.template) {
      throw new Error("Template Generate AC não encontrado");
    }
    if (!parsed.data) {
      return { response: "", sw: "6700", newState: this.state }; // Wrong length / missing data
    }

    // 1) parseia definição CDOL1 do modelo
    const cdolDef = CdolParser.parseDefinition(this.aid.cdol1);

    // 2) extrai os valores do APDU data
    const cdolMap = CdolParser.extractData(cdolDef, parsed.data);

    // 3) (opcional mas já final) salva UN no state se existir
    const un = cdolMap["9F37"];
    if (un) {
      this.state.session = this.state.session ?? {};
      this.state.session.un = un;
    }
    // Incrementa ATC
    this.state.atc += 1;

    const context: RuntimeContext = {
      state: this.state,
      aid: this.aid,
      inputApdu: parsed.raw,
      cdol: cdolMap,
    };

    const tlv = TlvBuilder.buildTemplate(apdu.template, (tag) =>
      this.resolveRuntimeTag(tag, context),
    );

    return {
      response: tlv,
      sw: apdu.sw,
      newState: this.state,
    };
  }
  // RUNTIME TAG RESOLUTION
  private resolveRuntimeTag(tag: CompiledTag, context: RuntimeContext): string {
    if (tag.type !== "RUNTIME") {
      throw new Error("resolveRuntimeTag chamado com tag não-runtime");
    }

    const prefix = tag.params?.prefix ?? "";

    let value: string;

    switch (tag.resolver) {
      case "ATC":
        value = context.state.atc.toString(16).padStart(4, "0").toUpperCase();
        break;

      case "AC":
        value = this.strategy.generateAC(context);
        break;

      case "CID":
        value = this.strategy.generateCID(context);
        break;

      case "IAD":
        value = this.strategy.generateIAD(context);
        break;

      case "SDAD":
        value = this.strategy.generateSDAD?.(context) ?? "";
        break;

      default:
        throw new Error(`Resolver não implementado: ${tag.resolver}`);
    }

    return `${prefix}${value}`.toUpperCase();
  }
}
