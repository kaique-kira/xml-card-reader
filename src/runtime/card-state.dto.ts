export interface EmvCardStateDTO {
  cardId: string;
  atc: number;
  lastCryptogram?: "ARQC" | "TC" | "AAC";
  pinTryCounter: number;
}
