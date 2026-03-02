export interface CardAssetLike {
  subtype: "CARD";
  model: string;
  title: string;
  description?: string;
  tags?: string[];
  externalDataSource?: string;
  externaDataSourceConnector?: Record<string, any> | null;
  properties: { key: string; value: any }[];
  version: number;
  apdus: CardApduLike[];
}

export interface CardApduLike {
  name?: string | null;
  command: string;
  expr?: string | null;

  responseType: "STATIC" | "EMV_INTERNAL_AUTHENTICATE" | "EMV_GENERATE_AC";

  response?: string | null;
  sw: string;
}
