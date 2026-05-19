export type BipModuleConfig = {
  name: string;
  source: string;
  outDir: string;
  category?: string;
  weight?: number;
};

export type BipScanCheck = {
  name: string;
  command: string[];
  category?: string;
  weight?: number;
};

export type BipConfig = {
  modules: BipModuleConfig[];
  checks?: BipScanCheck[];
};
