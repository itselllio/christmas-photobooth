import { createPaper } from './paper.mjs';
import { openness } from './gesture.mjs';

const canvas = document.querySelector('#paper');
const video = document.querySelector('#camera');
const tracking = document.querySelector('#tracking');
const overlay = document.querySelector('#landmarks');
const overlayContext = overlay.getContext('2d');
const capture = document.querySelector('#capture');
const star = document.querySelector('#star-trigger');
const retake = document.querySelector('#retake');
const save = document.querySelector('#save');
const connections = [
  [0,1,2,3,4], [0,5,6,7,8], [5,9,10,11,12],
  [9,13,14,15,16], [13,17,18,19,20], [0,17]
];
const status = document.querySelector('#status');
const start = document.querySelector('#start');
const reset = document.querySelector('#reset');
const slider = document.querySelector('#progress');
const table = document.querySelector('.table');
const demo = document.querySelector('#demo');
const upload = document.querySelector('#upload');
const paper = createPaper(canvas, star);
const defaultMessage = 'Make a fist, then slowly open one hand.';
const sdk = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304';
let detector;
let stream;
let frame;
let lastTime = -1;
let armed = false;
let complete = false;
let value = 0;
let portrait;
let manual = false;
let demoFrame;
let target = 0;
let lastScanTime;
let fullyOpenSince;

function message(text) {
  if (status.textContent !== text) status.textContent = text;
}

function drawFingertipTree(ctx, x, y, size) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size, size);

  ctx.fillStyle = '#80604a';
  ctx.fillRect(-.035, -.17, .07, .17);
  for (const [top, base, width, color] of [
    [-.65, -.12, .34, '#263c31'],
    [-.83, -.34, .26, '#344c3c'],
    [-1, -.58, .17, '#405b46']
  ]) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, top);
    ctx.lineTo(width, base);
    ctx.quadraticCurveTo(width * .12, base + .07, -width, base);
    ctx.closePath();
    ctx.fill();
  }

  ctx.fillStyle = '#fff3c9';
  ctx.shadowColor = '#ffd891';
  ctx.shadowBlur = size * .055;
  for (const [level, width, count] of [
    [.28, .25, 9], [.46, .20, 8], [.64, .14, 6], [.80, .08, 4]
  ]) {
    for (let i = 0; i < count; i++) {
      const across = (i / (count - 1)) * 2 - 1;
      ctx.beginPath();
      ctx.arc(across * width, -level + .046 * Math.cos(i * 2.4 + count), i % 3 ? .013 : .018, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.fillStyle = '#fff9e8';
  ctx.shadowBlur = size * .12;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const angle = i * Math.PI / 5 - Math.PI / 2;
    const radius = i % 2 ? .046 : .105;
    ctx.lineTo(Math.cos(angle) * radius, -1.02 + Math.sin(angle) * radius);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawLandmarks(points) {
  if (overlay.width !== video.videoWidth || overlay.height !== video.videoHeight) {
    overlay.width = video.videoWidth;
    overlay.height = video.videoHeight;
  }
  const w = overlay.width;
  const h = overlay.height;
  overlayContext.clearRect(0, 0, w, h);
  if (!points) return;
  overlayContext.strokeStyle = '#fff';
  overlayContext.fillStyle = '#fff';
  overlayContext.lineWidth = Math.max(2, w / 155);
  overlayContext.lineCap = 'round';
  for (const chain of connections) {
    overlayContext.beginPath();
    chain.forEach((index, i) => {
      const { x, y } = points[index];
      if (i === 0) overlayContext.moveTo(x * w, y * h);
      else overlayContext.lineTo(x * w, y * h);
    });
    overlayContext.stroke();
  }
  points.forEach(({ x, y }, index) => {
    overlayContext.beginPath();
    overlayContext.arc(x * w, y * h, w / (index && index % 4 === 0 ? 67 : 126), 0, Math.PI * 2);
    overlayContext.fill();
  });
  const indexTip = points[8];
  if (indexTip) drawFingertipTree(overlayContext, indexTip.x * w, indexTip.y * h, Math.min(w * .15, h * .22));
}

function updatePhotoControls() {
  tracking.hidden = !stream || complete;
  capture.hidden = !complete || !stream || Boolean(portrait);
  star.hidden = !complete || Boolean(portrait);
  star.setAttribute('aria-label', stream ? 'Take a photo' : 'Start the camera to take a photo');
  retake.hidden = !complete || !stream || !portrait;
  save.hidden = !complete || !portrait;
  paper.show(portrait || (stream && complete && video.readyState >= 2 ? video : undefined), !portrait);
}

function render(progress) {
  complete = progress === 1;
  const fade = Math.max(0, Math.min(1, (progress - .74) / .26));
  table.style.setProperty('--backdrop-opacity', 1 - fade * fade * (3 - 2 * fade));
  slider.value = Math.round(progress * 100);
  reset.disabled = progress === 0 && !armed;
  canvas.setAttribute('aria-label', complete ? 'A vintage photo frame on burgundy polka-dot paper' : 'Burgundy polka-dot paper unfolding');
  if (progress !== value) {
    value = progress;
    paper.set(progress);
    updatePhotoControls();
  }
}

function stop() {
  cancelAnimationFrame(frame);
  stream?.getTracks().forEach((track) => track.stop());
  stream = undefined;
  video.srcObject = null;
  updatePhotoControls();
  start.textContent = 'Start camera';
}

function scan(time) {
  if (!stream) return;
  const elapsed = lastScanTime == null ? 16 : Math.min(50, time - lastScanTime);
  lastScanTime = time;
  if (!complete && !manual && video.readyState >= 2 && lastTime !== video.currentTime) {
    lastTime = video.currentTime;
    try {
      const result = detector.detectForVideo(video, time);
      const hand = result.worldLandmarks[0];
      drawLandmarks(result.landmarks[0]);
      if (hand) {
        const amount = openness(hand);
        if (amount <= .12) armed = true;
        if (armed && !manual) {
          if (amount >= .98) fullyOpenSince ??= time;
          else fullyOpenSince = undefined;
          const ready = fullyOpenSince != null && time - fullyOpenSince >= 290;
          target = ready ? 1 : Math.min(.975, Math.max(0, (amount - .12) / .86));
          message('Slowly open your hand.');
        } else {
          message('Make a fist with one hand first.');
        }
      } else {
        fullyOpenSince = undefined;
        target = Math.min(target, .975);
        message('Bring one hand into the camera frame.');
      }
    } catch (error) {
      console.error(error);
      stop();
      message('Hand tracking stopped. Restart the camera or use manual preview.');
    }
  }
  if (stream && armed && !manual && !complete) {
    const next = value + (target - value) * (1 - Math.exp(-elapsed / 185));
    render(Math.abs(next - target) < .012 ? target : next);
    if (complete) message('Strike a pose and click the star.');
  }
  if (stream && complete && !portrait) paper.redraw();
  if (stream) frame = requestAnimationFrame(scan);
}

async function loadDetector() {
  const { FilesetResolver, HandLandmarker } = await import(sdk + '/vision_bundle.mjs');
  const files = await FilesetResolver.forVisionTasks(sdk + '/wasm');
  return HandLandmarker.createFromOptions(files, {
    baseOptions: {
      modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
      delegate: 'CPU'
    },
    runningMode: 'VIDEO',
    numHands: 1
  });
}

start.onclick = async () => {
  if (stream) {
    stop();
    message(defaultMessage);
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    message('Open this page on localhost or HTTPS to use the camera.');
    return;
  }
  start.disabled = true;
  message('Waiting for camera permission…');
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 480 }, height: { ideal: 360 } },
      audio: false
    });
    video.srcObject = stream;
    await video.play();
    updatePhotoControls();
    message('Loading hand tracking…');
    detector ??= await loadDetector();
    armed = false;
    manual = false;
    target = 0;
    fullyOpenSince = undefined;
    lastScanTime = undefined;
    lastTime = -1;
    if (complete) updatePhotoControls();
    else render(0);
    start.textContent = 'Stop camera';
    message(complete ? 'Strike a pose and click the star.' : 'Make a fist in front of the camera.');
    frame = requestAnimationFrame(scan);
  } catch (error) {
    console.error(error);
    stop();
    message(error.name === 'NotAllowedError'
      ? 'Camera permission was denied. You can still use manual preview.'
      : 'The camera or hand tracker is unavailable. You can still use manual preview.');
  } finally {
    start.disabled = false;
  }
};

reset.onclick = () => {
  cancelAnimationFrame(demoFrame);
  target = 0;
  fullyOpenSince = undefined;
  manual = false;
  armed = false;
  portrait = undefined;
  render(0);
  updatePhotoControls();
  message(defaultMessage);
};

slider.oninput = () => {
  cancelAnimationFrame(demoFrame);
  manual = true;
  armed = false;
  render(Number(slider.value) / 100);
  message(complete ? (stream ? 'Strike a pose and click the star.' : 'Start the camera or choose a photo.') : defaultMessage);
};

function previewOpening() {
  cancelAnimationFrame(demoFrame);
  manual = true;
  armed = false;
  render(0);
  message('Unfolding the paper…');
  const started = performance.now();
  function animate(now) {
    const fraction = Math.min(1, (now - started) / 2000);
    render(fraction * fraction * (3 - 2 * fraction));
    if (fraction < 1) {
      demoFrame = requestAnimationFrame(animate);
    } else {
      message(portrait ? 'Your collage is ready.' : stream ? 'Strike a pose and click the star.' : 'Start the camera or choose a photo.');
    }
  }
  demoFrame = requestAnimationFrame(animate);
}

demo.onclick = previewOpening;
upload.onchange = async () => {
  const [file] = upload.files;
  if (!file) return;
  try {
    portrait = await paper.replace(file);
    updatePhotoControls();
    message(complete ? 'Photo updated.' : 'Photo added. Unfold the paper to see it.');
  } catch {
    message('Could not open that photo. Choose another image.');
  } finally {
    upload.value = '';
  }
};

capture.onclick = () => {
  if (video.readyState < 2) return;
  const photo = document.createElement('canvas');
  photo.width = video.videoWidth;
  photo.height = video.videoHeight;
  const context = photo.getContext('2d');
  context.translate(photo.width, 0);
  context.scale(-1, 1);
  context.drawImage(video, 0, 0);
  portrait = photo;
  updatePhotoControls();
  message('Photo taken. Retake it or save your collage.');
};

star.onclick = () => {
  if (stream) capture.click();
  else if (!start.disabled) start.click();
};

retake.onclick = () => {
  portrait = undefined;
  updatePhotoControls();
  message('Strike a pose and click the star.');
};

save.onclick = () => paper.download();
window.addEventListener('pagehide', stop);
