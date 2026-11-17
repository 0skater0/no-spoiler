// Runs in the page (page.evaluate). Replaces every img[data-width][data-height]
// with a canvas holding the image downscaled by a Lanczos-3 filter: the
// browser's own image scaling blurs small text noticeably more.
export async function resampleImages() {
  const lanczos = (x) => {
    if (x === 0) return 1;
    if (x <= -3 || x >= 3) return 0;
    const px = Math.PI * x;
    return (3 * Math.sin(px) * Math.sin(px / 3)) / (px * px);
  };

  // Weights per output index along one axis, like Pillow's antialiased resize.
  function kernel(inSize, outSize) {
    const scale = outSize / inSize;
    const support = 3 / Math.min(scale, 1);
    const filterScale = Math.min(scale, 1);
    return Array.from({ length: outSize }, (_, i) => {
      const center = (i + 0.5) / scale;
      const start = Math.max(0, Math.floor(center - support));
      const end = Math.min(inSize, Math.ceil(center + support));
      const weights = [];
      let sum = 0;
      for (let j = start; j < end; j++) {
        const w = lanczos((j + 0.5 - center) * filterScale);
        weights.push(w);
        sum += w;
      }
      return { start, weights: weights.map((w) => w / sum) };
    });
  }

  function resize(src, sw, sh, dw, dh) {
    const kx = kernel(sw, dw);
    const ky = kernel(sh, dh);
    const tmp = new Float32Array(dw * sh * 4);
    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < dw; x++) {
        const { start, weights } = kx[x];
        const o = (y * dw + x) * 4;
        for (let k = 0; k < weights.length; k++) {
          const i = (y * sw + start + k) * 4;
          for (let c = 0; c < 4; c++) tmp[o + c] += src[i + c] * weights[k];
        }
      }
    }
    const out = new Uint8ClampedArray(dw * dh * 4);
    for (let y = 0; y < dh; y++) {
      const { start, weights } = ky[y];
      for (let x = 0; x < dw; x++) {
        const o = (y * dw + x) * 4;
        for (let c = 0; c < 4; c++) {
          let v = 0;
          for (let k = 0; k < weights.length; k++) v += tmp[((start + k) * dw + x) * 4 + c] * weights[k];
          out[o + c] = Math.round(v);
        }
      }
    }
    return out;
  }

  for (const img of document.querySelectorAll("img[data-width][data-height]")) {
    await img.decode();
    const dw = Number(img.dataset.width);
    const dh = Number(img.dataset.height);
    const source = document.createElement("canvas");
    source.width = img.naturalWidth;
    source.height = img.naturalHeight;
    const sctx = source.getContext("2d");
    sctx.drawImage(img, 0, 0);
    const { data } = sctx.getImageData(0, 0, source.width, source.height);
    const canvas = document.createElement("canvas");
    canvas.width = dw;
    canvas.height = dh;
    canvas.className = img.className;
    canvas.getContext("2d").putImageData(new ImageData(resize(data, source.width, source.height, dw, dh), dw, dh), 0, 0);
    img.replaceWith(canvas);
  }
}
