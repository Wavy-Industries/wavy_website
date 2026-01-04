export enum SampleMode {
  DRM = 0,
  PAT = 1,
}

export const sampleModeFromValue = (value: number): SampleMode => {
  return value === SampleMode.PAT ? SampleMode.PAT : SampleMode.DRM;
};

export const sampleModeLabel = (mode: SampleMode): string => SampleMode[mode];
