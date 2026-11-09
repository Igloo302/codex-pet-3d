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
  animations: {
    [key: string]: {
      clip: string;
      loop: boolean;
    };
  };
}
