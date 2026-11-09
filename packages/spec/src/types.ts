export type StandardAnimationState =
  | "idle"
  | "running-right"
  | "running-left"
  | "waving"
  | "jumping"
  | "failed"
  | "waiting"
  | "running"
  | "review";

export const STANDARD_ANIMATION_STATES: readonly StandardAnimationState[] = [
  "idle",
  "running-right",
  "running-left",
  "waving",
  "jumping",
  "failed",
  "waiting",
  "running",
  "review"
];

export interface ValidationError {
  path: string;
  code: string;
  message: string;
}

export interface Pet3DManifest {
  $schema: string;
  spec_version: string;
  id: string;
  display_name: string;
  author: string;
  description: string;
  model: string;
  scale: number;
  camera: {
    fov: number;
    position: [number, number, number];
    target: [number, number, number];
  };
  look_at: {
    enabled: boolean;
    head_bone: string;
    max_yaw_deg: number;
    max_pitch_deg: number;
  };
  animations: Record<StandardAnimationState, { clip: string; loop: boolean }>;
}
