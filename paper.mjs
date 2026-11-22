const stages = [
  './assets/paper-ball.jpg',
  './assets/paper-opening.jpg',
  './assets/paper-flat.jpg'
];

function load(source, onload) {
  const image = new Image();
  image.onload = onload;
  image.src = source;
  return image;
}

function cover(ctx, image, x, y, w, h, mirror) {
  const sw = image instanceof HTMLVideoElement ? image.videoWidth : image.width;
  const sh = image instanceof HTMLVideoElement ? image.videoHeight : image.height;
  if (!sw || !sh) return;
  const ratio = Math.min(sw / w, sh / h);
  const cw = w * ratio;
  const ch = h * ratio;
  ctx.save();
  ctx.translate(mirror ? x + w : x, y);
  if (mirror) ctx.scale(-1, 1);
  ctx.filter = 'saturate(.79) sepia(.19) contrast(.92) brightness(1.06)';
  ctx.drawImage(image, (sw - cw) / 2, (sh - ch) / 2, cw, ch, 0, 0, w, h);
  ctx.restore();
  const vignette = ctx.createRadialGradient(x + w / 2, y + h * .46, w * .25, x + w / 2, y + h * .46, h * .60);
  vignette.addColorStop(0, '#4c231900');
  vignette.addColorStop(1, '#4c231934');
  ctx.fillStyle = vignette;
  ctx.fillRect(x, y, w, h);
}

// Keep the printed cream dots opaque while lifting the neutral studio backing.
function removeBackdrop(image, cleanEdge = true) {
  const surface = document.createElement('canvas');
  const { naturalWidth: w, naturalHeight: h } = image;
  surface.width = w;
  surface.height = h;
  const ctx = surface.getContext('2d');
  ctx.drawImage(image, 0, 0);
  const pixels = ctx.getImageData(0, 0, w, h);
  const { data } = pixels;
  const visited = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let end = 0;
  function visit(x, y) {
    if (x < 0 || x >= w || y < 0 || y >= h) return;
    const i = y * w + x;
    if (visited[i]) return;
    visited[i] = 1;
    const offset = i * 4;
    const [r, g, b] = data.subarray(offset, offset + 3);
    if (Math.max(r, g, b) - Math.min(r, g, b) > 22 || b < 130) return;
    queue[end++] = i;
    const gray = (r + g + b) / 3;
    data[offset] = 38;
    data[offset + 1] = 21;
    data[offset + 2] = 17;
    data[offset + 3] = Math.min(160, Math.max(0, (252 - gray) * 1.55));
  }
  for (let x = 0; x < w; x++) { visit(x, 0); visit(x, h - 1); }
  for (let y = 0; y < h; y++) { visit(0, y); visit(w - 1, y); }
  for (let start = 0; start < end; start++) {
    const i = queue[start];
    const x = i % w;
    const y = Math.floor(i / w);
    visit(x + 1, y);
    visit(x - 1, y);
    visit(x, y + 1);
    visit(x, y - 1);
  }
  if (cleanEdge) {
    const alpha = new Uint8Array(w * h);
    for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3];
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        if (alpha[i] !== 255) continue;
        const nearest = Math.min(alpha[i - 1], alpha[i + 1], alpha[i - w], alpha[i + w]);
        if (nearest < 220) data[i * 4 + 3] = 105 + Math.round(nearest * .5);
      }
    }
  }
  ctx.putImageData(pixels, 0, 0);
  return surface;
}

export function createPaper(canvas, starButton) {
  const ctx = canvas.getContext('2d');
  const cutouts = [];
  const images = stages.map((src, index) => load(src, () => {
    if (index < 2) cutouts[index] = removeBackdrop(images[index]);
    draw();
  }));
  const lace = load('./assets/lace.jpg', draw);
  let starArt;
  const starImage = load('./assets/photo-star.png', () => {
    const stencil = document.createElement('canvas');
    stencil.width = starImage.naturalWidth;
    stencil.height = starImage.naturalHeight;
    const ink = stencil.getContext('2d');
    ink.drawImage(starImage, 0, 0);
    const image = ink.getImageData(0, 0, stencil.width, stencil.height);
    const { data } = image;
    for (let i = 0; i < data.length; i += 4) {
      const darkness = 255 - (data[i] + data[i + 1] + data[i + 2]) / 3;
      data[i] = data[i + 1] = data[i + 2] = 255;
      data[i + 3] = Math.max(0, Math.min(255, (darkness - 18) * 1.35));
    }
    ink.putImageData(image, 0, 0);
    starArt = stencil;
    draw();
  });
  const lettering = document.createElement('canvas');
  lettering.width = 352;
  lettering.height = 92;
  const pen = lettering.getContext('2d');

  function writeCaption(target, text, x, y) {
    pen.clearRect(0, 0, lettering.width, lettering.height);
    pen.save();
    pen.scale(2, 2);
    pen.font = "23px 'Princess Sofia', 'Bradley Hand', cursive";
    pen.fillStyle = '#fff0d4';
    pen.fillText(text, 2, 30);
    pen.globalCompositeOperation = 'destination-out';
    pen.strokeStyle = '#000';
    pen.lineWidth = .35;
    pen.strokeText(text, 2, 30);
    pen.restore();
    target.drawImage(lettering, x - 2, y - 30, 176, 46);
  }

  let portrait;
  let mirrored = false;
  let progress = 0;
  let width = 0;
  let height = 0;
  let pixelRatio = 1;

  function collage(target, w, h) {
    const image = images[2];
    if (image.naturalWidth) target.drawImage(image, 0, 0, w, h);
    else {
      target.fillStyle = '#6d2936';
      target.fillRect(0, 0, w, h);
    }
    target.save();
    target.translate(w / 2, h / 2);
    const scale = Math.min(w / 472, h / 680);
    target.scale(scale, scale);
    if (lace.naturalWidth) {
      target.save();
      target.translate(-135, -196.5);
      const outline = new Path2D('M 7,24 Q 26,-3 63,6 Q 77,10 92,5 Q 105,3 120,7 Q 140,-1 166,8 Q 184,2 211,8 Q 238,-4 254,14 Q 279,32 261,84 Q 269,102 259,120 Q 275,164 261,222 Q 257,251 262,282 Q 271,297 258,313 Q 277,350 259,373 Q 247,393 201,383 Q 183,390 164,383 Q 143,393 116,383 Q 96,390 77,382 Q 46,392 21,380 Q -5,368 6,329 Q 7,316 16,307 Q -2,294 11,271 Q 1,228 7,191 Q 11,140 17,126 Q -3,101 15,80 Q -4,54 7,24 Z');
      target.clip(outline);
      target.drawImage(lace, 0, 0);
      target.restore();
    }
    target.fillStyle = '#f4e9d2';
    target.fillRect(-91, -152, 184, 305);
    if (portrait) cover(target, portrait, -84, -145, 170, 277, mirrored);
    target.fillStyle = '#fff0d4';
    writeCaption(target, 'Merry Christmas', -191, -222);
    writeCaption(target, 'little moments', 61, 267);
    target.font = '24px Georgia, serif';
    if (starArt) {
      target.save();
      target.translate(78, 211);
      target.rotate(-.055);
      target.shadowColor = '#401e1c70';
      target.shadowBlur = 2;
      target.shadowOffsetY = 1;
      target.drawImage(starArt, -34, -23, 68, 46);
      target.restore();
    }
    target.fillText('✧', -180, -176);
    target.restore();
  }

  function draw() {
    if (!width || !height) return;
    ctx.clearRect(0, 0, width, height);
    const final = images[2];
    const ratio = final.naturalWidth ? final.naturalWidth / final.naturalHeight : .65;
    const h = Math.min(height * .96, Math.max(1, width - 130) / ratio);
    const w = h * ratio;
    if (progress === 1) {
      const scale = Math.min(w / 472, h / 680);
      starButton.style.left = `${width / 2 + 78 * scale}px`;
      starButton.style.top = `${height / 2 + 211 * scale}px`;
      starButton.style.width = `${68 * scale}px`;
      starButton.style.height = `${46 * scale}px`;
      starButton.style.setProperty('--star-offset', `${w / 2 - 78 * scale + 9}px`);
      starButton.style.setProperty('--star-label-width', `${Math.min(140, (width - w) / 2 - 13)}px`);
      starButton.style.setProperty('--star-font', `${Math.max(13, 17 * scale)}px`);
      ctx.save();
      ctx.translate((width - w) / 2, (height - h) / 2);
      collage(ctx, w, h);
      ctx.restore();
      return;
    }

    const position = progress * 2;
    const index = Math.floor(position);
    const blend = position - index;
    const sizes = [.48, .80, 1];
    const size = sizes[index] * (1 - blend) + sizes[index + 1] * blend;
    const shadowStrength = Math.max(0, 1 - progress * 1.36);
    if (shadowStrength) {
      ctx.save();
      ctx.translate(width / 2 + h * .018, height / 2 + h * size * .34);
      ctx.scale(1, .31);
      const radius = Math.max(1, h * size * .35);
      const shadow = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
      shadow.addColorStop(0, `rgba(25, 11, 9, ${.70 * shadowStrength})`);
      shadow.addColorStop(.52, `rgba(29, 12, 10, ${.30 * shadowStrength})`);
      shadow.addColorStop(1, 'rgba(29, 12, 10, 0)');
      ctx.fillStyle = shadow;
      ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
      ctx.restore();
    }
    for (let step = 0; step < 2; step++) {
      const image = images[index + step];
      if (!image.naturalWidth) continue;
      const factor = size / sizes[index + step];
      const imageHeight = h * sizes[index + step] * factor;
      const imageWidth = imageHeight * image.naturalWidth / image.naturalHeight;
      ctx.globalAlpha = step ? blend : 1 - blend;
      ctx.filter = index + step < 2 ? 'brightness(.87) saturate(.87) sepia(.11)' : 'none';
      ctx.drawImage(cutouts[index + step] || image, (width - imageWidth) / 2, (height - imageHeight) / 2, imageWidth, imageHeight);
    }
    ctx.globalAlpha = 1;
    ctx.filter = 'none';
  }

  new ResizeObserver(([entry]) => {
    ({ width, height } = entry.contentRect);
    pixelRatio = Math.min(devicePixelRatio, 2);
    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    draw();
  }).observe(canvas);

  document.fonts.load("23px 'Princess Sofia'").then(draw, draw);

  return {
    set(value) { progress = value; draw(); },
    show(source, mirror = false) { portrait = source; mirrored = mirror; draw(); },
    redraw: draw,
    async replace(file) {
      const url = URL.createObjectURL(file);
      const image = new Image();
      try {
        image.src = url;
        await image.decode();
        return image;
      } finally {
        URL.revokeObjectURL(url);
      }
    },
    download() {
      const output = document.createElement('canvas');
      output.width = 1080;
      output.height = Math.round(1080 * (images[2].naturalHeight / images[2].naturalWidth || 1.5));
      collage(output.getContext('2d'), output.width, output.height);
      const link = document.createElement('a');
      link.download = 'paper-collage.png';
      link.href = output.toDataURL('image/png');
      link.click();
    }
  };
}
