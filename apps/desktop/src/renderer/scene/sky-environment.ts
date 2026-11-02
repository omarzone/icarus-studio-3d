import { DataTexture, EquirectangularReflectionMapping, SRGBColorSpace } from "three";

// A small picture of the world around the scene for reflective parts to mirror: the sky's gradient above the horizon
// and the ground's color below it, laid out equirectangular. Row 0 of a DataTexture is the bottom of the image, so rows run from straight down to
// straight up.
export const ENVIRONMENT_WIDTH = 32;
export const ENVIRONMENT_HEIGHT = 16;

function rgb(color: string): [number, number, number] {
  const value = Number.parseInt(color.slice(1, 7), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

export function environmentPixels(top: string, horizon: string, ground: string): Uint8Array {
  const pixels = new Uint8Array(ENVIRONMENT_WIDTH * ENVIRONMENT_HEIGHT * 4);
  const [high, middle, low] = [rgb(top), rgb(horizon), rgb(ground)];
  for (let row = 0; row < ENVIRONMENT_HEIGHT; row += 1) {
    // Height of the row's direction, 1 straight up and -1 straight down, as the sky dome shades it.
    const height = -Math.cos(((row + 0.5) / ENVIRONMENT_HEIGHT) * Math.PI);
    const blend = height > 0 ? height ** 0.6 : 0;
    const color = height > 0 ? middle.map((value, index) => value + ((high[index] ?? 0) - value) * blend) : low;
    for (let column = 0; column < ENVIRONMENT_WIDTH; column += 1) {
      const index = (row * ENVIRONMENT_WIDTH + column) * 4;
      pixels[index] = Math.round(color[0] ?? 0);
      pixels[index + 1] = Math.round(color[1] ?? 0);
      pixels[index + 2] = Math.round(color[2] ?? 0);
      pixels[index + 3] = 255;
    }
  }
  return pixels;
}

export function createSkyEnvironment(top: string, horizon: string, ground: string): DataTexture {
  const texture = new DataTexture(environmentPixels(top, horizon, ground), ENVIRONMENT_WIDTH, ENVIRONMENT_HEIGHT);
  texture.mapping = EquirectangularReflectionMapping;
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

// Only worlds with something reflective get an environment, so every other scene renders exactly as before.
export function needsEnvironment(geoms: readonly { reflectance?: number }[]): boolean {
  return geoms.some((geom) => (geom.reflectance ?? 0) > 0);
}
