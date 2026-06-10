interface PixelitConfig {
  to: HTMLCanvasElement;
  from: HTMLImageElement | HTMLCanvasElement;
  scale?: number;
  palette?: [number, number, number][];
  maxHeight?: number;
  maxWidth?: number;
}

export class Pixelit {
  constructor(config: PixelitConfig);
  setPalette(arr: [number, number, number][]): this;
  setMaxWidth(width: number): this;
  setMaxHeight(height: number): this;
  setScale(scale: number): this;
  getPalette(): [number, number, number][];
  pixelate(): this;
  convertGrayscale(): this;
  convertPalette(): this;
  resizeImage(): this;
  draw(): this;
}
