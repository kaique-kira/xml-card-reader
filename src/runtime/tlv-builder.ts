import {
  CompiledAid,
  CompiledTag,
  CompiledTemplate,
} from "../interface/asset.interface";

export class TlvBuilder {
  static buildTemplate(
    template: CompiledTemplate,
    resolver: (tag: CompiledTag) => string,
  ): string {
    const childrenHex = template.children
      .map((child) => {
        const value = child.type === "STATIC" ? child.value : resolver(child);

        const length = this.encodeLength(value.length / 2);

        return `${child.tag}${length}${value}`;
      })
      .join("");

    const templateLength = this.encodeLength(childrenHex.length / 2);

    return `${template.tag}${templateLength}${childrenHex}`;
  }

  private static encodeLength(length: number): string {
    if (length < 0x80) {
      return length.toString(16).padStart(2, "0").toUpperCase();
    }

    const hex = length.toString(16);
    const bytes = Math.ceil(hex.length / 2);

    return (
      (0x80 + bytes).toString(16).toUpperCase() +
      hex.padStart(bytes * 2, "0").toUpperCase()
    );
  }
}

export interface RuntimeContext {
  state: CardRuntimeState;
  aid: CompiledAid;
  inputApdu: string;
}

export type RuntimeTagResolver = (
  tag: CompiledTag,
  context: RuntimeContext,
) => string;

export interface CardRuntimeState {
  atc: number;
  lastCid?: string;
  lastAc?: string;

  session?: {
    un?: string;
    skac?: string;
  };

  pinTryCounter: number;
}
