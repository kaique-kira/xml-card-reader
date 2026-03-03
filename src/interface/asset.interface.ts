// SCHEME
export type SchemeType = "VISA" | "MASTERCARD" | "AMEX" | "ELO" | "DISCOVER";

// CARD MODEL (imutável)
export interface CompiledCardModel {
  aids: CompiledAid[];
}

// AID (cada aplicação é isolada)
export interface CompiledAid {
  aid: string;
  label?: string;
  scheme: SchemeType;
  apdus: CompiledApdu[];

  // ✅ CDOL definitions (hex puro, sem espaços)
  cdol1: string; // tag 8C
  cdol2?: string; // tag 8D
  ddol?: string; // tag 9F49

  keys: {
    symmetric: CompiledSymmetricKeys;
    rsa?: RsaKeySet;
  };
}

// APDU MODEL
export interface CompiledApdu {
  cla: string;
  ins: string;
  p1?: string;
  p2?: string;

  /**
   * Como a engine deve fazer o match
   * - CLA_INS → ignora P1/P2
   * - FULL_HEADER → exige match completo
   */
  match: "CLA_INS" | "FULL_HEADER";

  behavior: ApduBehavior;

  template?: CompiledTemplate;

  sw: string;

  instance?: number;
}

export type ApduBehavior =
  | "STATIC"
  | "GENERATE_AC"
  | "INTERNAL_AUTH"
  | "GET_PROCESSING_OPTIONS"
  | "READ_RECORD";

// TEMPLATE (bytecode do cartão)
export interface CompiledTemplate {
  tag: string; // ex: "80" ou "77"
  children: CompiledTag[];
}

export type CompiledTag =
  | {
      type: "STATIC";
      tag: string;
      value: string;
    }
  | {
      type: "RUNTIME";
      tag: string;
      resolver: RuntimeResolver;
      params?: any;
    };

// RUNTIME RESOLVERS
export type RuntimeResolver =
  | "ATC"
  | "AC"
  | "CID"
  | "IAD"
  | "SDAD"
  | "CVC3_TRACK1"
  | "CVC3_TRACK2";

// KEYS
export interface CompiledSymmetricKeys {
  mkac: string; // Master Key AC
  mksmi?: string; // Secure Messaging Integrity
  mksmc?: string; // Secure Messaging Confidentiality
}

export interface RsaKeySet {
  modulus: string;
  exponent: string;
  privateExponent?: string;
}
