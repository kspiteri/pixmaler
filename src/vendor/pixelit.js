/**
 * pixelit - convert an image to Pixel Art, with/out grayscale and based on a color palette.
 * @author José Moreira @ <https://github.com/giventofly/pixelit>
 *
 * Vendored from https://github.com/giventofly/pixelit (MIT).
 * Modifications:
 * - Removed `hideFromImg()` DOM-mutation side effect.
 * - Removed `document.body.appendChild(tempCanvas)` mid-pixelate (no longer needed).
 * - Stripped `saveImage()` (uses `<a>` link clicks; not used here).
 */

export class Pixelit {
  constructor(config = {}) {
    this.drawto = config.to;
    this.drawfrom = config.from;
    this.scale =
      config.scale && config.scale > 0 && config.scale <= 50
        ? config.scale * 0.01
        : 8 * 0.01;
    this.palette = config.palette || [
      [140, 143, 174],
      [88, 69, 99],
      [62, 33, 55],
      [154, 99, 72],
      [215, 155, 125],
      [245, 237, 186],
      [192, 199, 65],
      [100, 125, 52],
      [228, 148, 58],
      [157, 48, 59],
      [210, 100, 113],
      [112, 55, 127],
      [126, 196, 193],
      [52, 133, 157],
      [23, 67, 75],
      [31, 14, 28],
    ];
    this.maxHeight = config.maxHeight;
    this.maxWidth = config.maxWidth;
    this.ctx = this.drawto.getContext("2d");
    this.endColorStats = {};
  }

  setPalette(arr) { this.palette = arr; return this; }
  setMaxWidth(width) { this.maxWidth = width; return this; }
  setMaxHeight(height) { this.maxHeight = height; return this; }
  setScale(scale) { this.scale = scale > 0 && scale <= 50 ? scale * 0.01 : 8 * 0.01; return this; }
  getPalette() { return this.palette; }

  colorSim(rgbColor, compareColor) {
    let d = 0;
    for (let i = 0, max = rgbColor.length; i < max; i++) {
      const diff = rgbColor[i] - compareColor[i];
      d += diff * diff;
    }
    return Math.sqrt(d);
  }

  similarColor(actualColor) {
    let selectedColor = this.palette[0];
    let currentSim = this.colorSim(actualColor, selectedColor);
    for (let i = 1; i < this.palette.length; i++) {
      const color = this.palette[i];
      const nextColor = this.colorSim(actualColor, color);
      if (nextColor <= currentSim) {
        selectedColor = color;
        currentSim = nextColor;
      }
    }
    return selectedColor;
  }

  pixelate() {
    if (!this.drawfrom) return this;
    const natW = this.drawfrom.naturalWidth || this.drawfrom.width;
    const natH = this.drawfrom.naturalHeight || this.drawfrom.height;
    this.drawto.width = natW;
    this.drawto.height = natH;

    let workScale = this.scale;
    let scaledW = natW * workScale;
    let scaledH = natH * workScale;

    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = natW;
    tempCanvas.height = natH;

    if (natW > 900 || natH > 900) {
      workScale *= 0.5;
      scaledW = natW * workScale;
      scaledH = natH * workScale;
      tempCanvas.width = Math.max(scaledW, scaledH) + 50;
      tempCanvas.height = Math.max(scaledW, scaledH) + 50;
    }
    const tempContext = tempCanvas.getContext("2d");
    tempContext.drawImage(this.drawfrom, 0, 0, scaledW, scaledH);

    this.ctx.mozImageSmoothingEnabled = false;
    this.ctx.webkitImageSmoothingEnabled = false;
    this.ctx.imageSmoothingEnabled = false;

    let finalWidth = natW;
    if (natW > 300) {
      finalWidth +=
        natW > natH
          ? parseInt(natW / (natW * workScale)) / 1.5
          : parseInt(natW / (natW * workScale));
    }
    let finalHeight = natH;
    if (natH > 300) {
      finalHeight +=
        natH > natW
          ? parseInt(natH / (natH * workScale)) / 1.5
          : parseInt(natH / (natH * workScale));
    }
    this.ctx.drawImage(
      tempCanvas,
      0, 0, scaledW, scaledH,
      0, 0, finalWidth, finalHeight,
    );

    return this;
  }

  convertGrayscale() {
    const w = this.drawto.width;
    const h = this.drawto.height;
    const imgPixels = this.ctx.getImageData(0, 0, w, h);
    const data = imgPixels.data;
    for (let i = 0; i < data.length; i += 4) {
      const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
      data[i] = avg;
      data[i + 1] = avg;
      data[i + 2] = avg;
    }
    this.ctx.putImageData(imgPixels, 0, 0);
    return this;
  }

  convertPalette() {
    const w = this.drawto.width;
    const h = this.drawto.height;
    const imgPixels = this.ctx.getImageData(0, 0, w, h);
    const data = imgPixels.data;
    for (let i = 0; i < data.length; i += 4) {
      const finalcolor = this.similarColor([data[i], data[i + 1], data[i + 2]]);
      data[i] = finalcolor[0];
      data[i + 1] = finalcolor[1];
      data[i + 2] = finalcolor[2];
    }
    this.ctx.putImageData(imgPixels, 0, 0);
    return this;
  }

  resizeImage() {
    if (!this.maxWidth && !this.maxHeight) return this;

    const canvasCopy = document.createElement("canvas");
    const copyContext = canvasCopy.getContext("2d");
    let ratio = 1.0;

    if (this.maxWidth && this.drawto.width > this.maxWidth) {
      ratio = this.maxWidth / this.drawto.width;
    }
    if (this.maxHeight && this.drawto.height > this.maxHeight) {
      ratio = this.maxHeight / this.drawto.height;
    }

    canvasCopy.width = this.drawto.width;
    canvasCopy.height = this.drawto.height;
    copyContext.drawImage(this.drawto, 0, 0);

    this.drawto.width = Math.max(1, this.drawto.width * ratio);
    this.drawto.height = Math.max(1, this.drawto.height * ratio);
    this.ctx.drawImage(
      canvasCopy,
      0, 0, canvasCopy.width, canvasCopy.height,
      0, 0, this.drawto.width, this.drawto.height,
    );

    return this;
  }

  draw() {
    if (!this.drawfrom) return this;
    const w = this.drawfrom.naturalWidth || this.drawfrom.width;
    const h = this.drawfrom.naturalHeight || this.drawfrom.height;
    this.drawto.width = w;
    this.drawto.height = h;
    this.ctx.drawImage(this.drawfrom, 0, 0);
    this.resizeImage();
    return this;
  }
}
