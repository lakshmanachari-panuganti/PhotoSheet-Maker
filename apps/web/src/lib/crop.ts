export interface CropRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export const defaultCenterCrop = (
  imageWidth: number,
  imageHeight: number,
  targetAspect: number,
): CropRect => {
  const sourceAspect = imageWidth / imageHeight;
  if (sourceAspect > targetAspect) {
    const width = Math.round(imageHeight * targetAspect);
    return {
      x: Math.round((imageWidth - width) / 2),
      y: 0,
      width,
      height: imageHeight,
    };
  }
  const height = Math.round(imageWidth / targetAspect);
  return {
    x: 0,
    y: Math.round((imageHeight - height) / 2),
    width: imageWidth,
    height,
  };
};

export const cropToDataUrl = (
  bitmap: HTMLImageElement | ImageBitmap,
  crop: CropRect,
  maxSide = 640,
): string => {
  const scale = Math.min(1, maxSide / Math.max(crop.width, crop.height));
  const outW = Math.max(1, Math.round(crop.width * scale));
  const outH = Math.max(1, Math.round(crop.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('cropToDataUrl: no 2D context');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, outW, outH);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, crop.x, crop.y, crop.width, crop.height, 0, 0, outW, outH);
  return canvas.toDataURL('image/jpeg', 0.9);
};
