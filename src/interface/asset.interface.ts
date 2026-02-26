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
  responseType?: null;
  response?: string | null;
  sw: string;
}
