// Reads the PNG header; the stores reject screenshots with an alpha channel.
const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
export const COLOR_TYPE_RGB = 2;

export function pngInfo(buf) {
  if (buf.length < 29 || !buf.subarray(0, 8).equals(SIGNATURE) || buf.toString("latin1", 12, 16) !== "IHDR") {
    throw new Error("Not a PNG file");
  }
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
    bitDepth: buf[24],
    colorType: buf[25],
  };
}

/** Throws unless the PNG is 8-bit RGB (no alpha, no palette) of the expected size. */
export function assertRgbPng(buf, width, height, name = "image") {
  const info = pngInfo(buf);
  if (info.colorType !== COLOR_TYPE_RGB || info.bitDepth !== 8) {
    throw new Error(`${name}: PNG color type ${info.colorType}, bit depth ${info.bitDepth}; expected 8-bit RGB`);
  }
  if (info.width !== width || info.height !== height) {
    throw new Error(`${name}: ${info.width}x${info.height}, expected ${width}x${height}`);
  }
  return info;
}
