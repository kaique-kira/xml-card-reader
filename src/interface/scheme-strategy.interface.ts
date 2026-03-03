import { RuntimeContext } from "../runtime/tlv-builder";

export interface SchemeStrategy {
  generateAC(context: RuntimeContext): string;
  generateCID(context: RuntimeContext): string;
  generateIAD(context: RuntimeContext): string;
}
