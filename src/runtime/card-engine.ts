import { CardAssetLike } from "../interface/asset.interface";
import { EmvCardStateDTO } from "./card-state.dto";

export class EmvCardEngine {
  constructor(
    private asset: CardAssetLike,
    private state: EmvCardStateDTO,
  ) {}

  private matchApdu(commandHex: string) {
    const normalized = commandHex.toUpperCase().replace(/\s+/g, "");

    const claIns = normalized.slice(0, 4); // CLA + INS

    return this.asset.apdus.find((a) => {
      const apduHeader = a.command.slice(0, 4);
      return apduHeader === claIns;
    });
  }
  private handleStatic(apdu: any) {
    return {
      response: apdu.response ?? "",
      sw: apdu.sw,
      newState: this.state,
    };
  }

  private handleGenerateAc(commandHex: string, apdu: any) {
    // Por enquanto, replay
    return {
      response: apdu.response ?? "",
      sw: apdu.sw,
      newState: this.state,
    };
  }

  private handleInternalAuthenticate(commandHex: string, apdu: any) {
    return {
      response: apdu.response ?? "",
      sw: apdu.sw,
      newState: this.state,
    };
  }

  processApdu(commandHex: string) {
    const apdu = this.matchApdu(commandHex);

    if (!apdu) {
      return { response: "", sw: "6D00", newState: this.state };
    }

    switch (apdu.responseType) {
      case "STATIC":
        return this.handleStatic(apdu);

      case "EMV_GENERATE_AC":
        return this.handleGenerateAc(commandHex, apdu);

      case "EMV_INTERNAL_AUTHENTICATE":
        return this.handleInternalAuthenticate(commandHex, apdu);

      default:
        return { response: "", sw: "6F00", newState: this.state };
    }
  }
}
