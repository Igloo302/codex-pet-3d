#!/usr/bin/env node
/**
 * Renders high-resolution showcase images for README.md from assets/cyber-cat
 * using the existing headless Puppeteer + Three.js + Sharp pipeline.
 *
 * Run after `pnpm run build`:
 *   node scripts/render-preview-images.mjs
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import sharp from "sharp";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const ASSET_DIR = path.join(ROOT, "assets", "cyber-cat");
const OUT_DIR = path.join(ROOT, "docs", "images");

const cliRequire = createRequire(path.join(ROOT, "packages", "cli", "package.json"));
const puppeteer = cliRequire("puppeteer");

const { SpritesheetBaker } = await import("../packages/cli/dist/baker/SpritesheetBaker.js");
const { bundleBrowserScript, getSwiftShaderArgs, resolveExecutablePath } = await import(
  "../packages/cli/dist/baker/browser-utils.js"
);

const RENDER_SCRIPT = `
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

window.__renderPose = async ({ glbBase64, width, height, clipName, timeRatio, yawDeg, pitchDeg, cameraPos, cameraTarget, fov, scale }) => {
  const binary = atob(glbBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(width, height, false);
  renderer.setPixelRatio(1);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const keyLight = new THREE.DirectionalLight(0xfff6eb, 1.7);
  keyLight.position.set(2.2, 3.4, 2.8);
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0xc7e2ff, 0.8);
  fillLight.position.set(-2.5, 1.8, 1.6);
  scene.add(fillLight);

  const rimLight = new THREE.DirectionalLight(0x7dd3fc, 1.05);
  rimLight.position.set(0.2, 2.4, -3.2);
  scene.add(rimLight);

  const hemiLight = new THREE.HemisphereLight(0xe0f2fe, 0x3b2f4a, 0.9);
  scene.add(hemiLight);

  const camera = new THREE.PerspectiveCamera(fov, width / height, 0.1, 100);
  camera.position.set(...cameraPos);
  camera.lookAt(...cameraTarget);

  const loader = new GLTFLoader();
  const gltf = await new Promise((resolve, reject) => loader.parse(bytes.buffer, '', resolve, reject));
  const root = new THREE.Group();
  root.scale.setScalar(scale);
  root.add(gltf.scene);
  scene.add(root);

  const mixer = new THREE.AnimationMixer(gltf.scene);
  const clip = gltf.animations.find((c) => c.name === clipName) || gltf.animations[0];
  if (clip) {
    const action = mixer.clipAction(clip);
    action.play();
    mixer.setTime(clip.duration * timeRatio);
  }

  let headBone = null;
  gltf.scene.traverse((obj) => {
    if (obj.isBone && obj.name === 'Head') headBone = obj;
  });
  if (headBone) {
    const baseQ = headBone.quaternion.clone();
    const euler = new THREE.Euler(
      THREE.MathUtils.degToRad(-pitchDeg),
      THREE.MathUtils.degToRad(yawDeg),
      0,
      'YXZ'
    );
    const rotQ = new THREE.Quaternion().setFromEuler(euler);
    headBone.quaternion.copy(baseQ).multiply(rotQ);
  }

  root.updateMatrixWorld(true);
  renderer.render(scene, camera);
  const dataUrl = canvas.toDataURL('image/png');
  renderer.dispose();
  return dataUrl;
};
`;

async function renderHeroShowcase(manifest, glbBase64) {
  const cardW = 380;
  const cardH = 420;
  const totalW = 1220;
  const totalH = 480;

  const poses = [
    {
      title: "Idle · Cursor LookAt",
      subtitle: "Damped head tracking",
      clipName: manifest.animations.idle.clip,
      timeRatio: 0.25,
      yawDeg: 22,
      pitchDeg: 10,
      cameraPos: [0.35, 1.15, 2.35],
      cameraTarget: [0, 0.48, 0],
    },
    {
      title: "Wave · Interactive",
      subtitle: "Click or greeting hook",
      clipName: manifest.animations.waving.clip,
      timeRatio: 0.45,
      yawDeg: -10,
      pitchDeg: 8,
      cameraPos: [0, 1.18, 2.35],
      cameraTarget: [0, 0.48, 0],
    },
    {
      title: "Work · Codex Sync",
      subtitle: "Auto-triggered on coding",
      clipName: manifest.animations.running.clip,
      timeRatio: 0.35,
      yawDeg: -18,
      pitchDeg: -6,
      cameraPos: [-0.45, 1.2, 2.35],
      cameraTarget: [0, 0.48, 0],
    },
  ];

  const bundle = await bundleBrowserScript(RENDER_SCRIPT, "preview-render.js");
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: resolveExecutablePath(),
    args: getSwiftShaderArgs(),
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: cardW * 2, height: cardH * 2, deviceScaleFactor: 1 });
    await page.setContent("<!doctype html><html><body style='margin:0;background:transparent;'></body></html>");
    await page.addScriptTag({ content: bundle });

    const renderedCards = [];
    for (const pose of poses) {
      const dataUrl = await page.evaluate(
        (params) => window.__renderPose(params),
        {
          glbBase64,
          width: cardW * 2,
          height: cardH * 2,
          clipName: pose.clipName,
          timeRatio: pose.timeRatio,
          yawDeg: pose.yawDeg,
          pitchDeg: pose.pitchDeg,
          cameraPos: pose.cameraPos,
          cameraTarget: pose.cameraTarget,
          fov: manifest.camera.fov,
          scale: manifest.scale,
        }
      );
      const rawPng = Buffer.from(dataUrl.split(",")[1], "base64");
      const resized = await sharp(rawPng)
        .resize(cardW, cardH, { kernel: sharp.kernel.lanczos3 })
        .png()
        .toBuffer();
      renderedCards.push({ pose, png: resized });
    }

    const bgSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${totalH}">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#070b14"/>
          <stop offset="50%" stop-color="#0e1628"/>
          <stop offset="100%" stop-color="#080d19"/>
        </linearGradient>
        <radialGradient id="glow1" cx="18%" cy="22%" r="45%">
          <stop offset="0%" stop-color="#4cc9f0" stop-opacity="0.22"/>
          <stop offset="100%" stop-color="#4cc9f0" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="glow2" cx="84%" cy="20%" r="42%">
          <stop offset="0%" stop-color="#a78bfa" stop-opacity="0.22"/>
          <stop offset="100%" stop-color="#a78bfa" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="${totalW}" height="${totalH}" rx="20" fill="url(#bg)"/>
      <rect width="${totalW}" height="${totalH}" rx="20" fill="url(#glow1)"/>
      <rect width="${totalW}" height="${totalH}" rx="20" fill="url(#glow2)"/>
      ${poses
        .map((pose, idx) => {
          const x = 24 + idx * 396;
          return `
            <rect x="${x}" y="24" width="380" height="432" rx="16" fill="rgba(17,24,39,0.68)" stroke="rgba(148,163,184,0.2)" stroke-width="1"/>
            <text x="${x + 190}" y="420" text-anchor="middle" fill="#e6edf7" font-family="Inter,system-ui,-apple-system,sans-serif" font-size="16" font-weight="700">${pose.title}</text>
            <text x="${x + 190}" y="442" text-anchor="middle" fill="#8b9bb4" font-family="Inter,system-ui,-apple-system,sans-serif" font-size="12">${pose.subtitle}</text>
          `;
        })
        .join("")}
    </svg>`;

    const composites = renderedCards.map((item, idx) => ({
      input: item.png,
      left: 24 + idx * 396,
      top: 12,
    }));

    await sharp(Buffer.from(bgSvg))
      .composite(composites)
      .png({ compressionLevel: 9 })
      .toFile(path.join(OUT_DIR, "cyber-cat-showcase.png"));
  } finally {
    await browser.close();
  }
}

async function renderSpritesheetPreview(manifest, glbBytes) {
  const tmp = mkdtempSync(path.join(tmpdir(), "codex-pet-preview-"));
  try {
    const baker = new SpritesheetBaker({ glbBytes, manifest, outDir: tmp });
    const baked = await baker.bake();

    // Scale down 1536x2288 spritesheet to 768x1144 and mount on a sleek dark card with subtle grid
    const sheetW = 768;
    const sheetH = 1144;
    const pad = 28;
    const cardW = sheetW + pad * 2;
    const cardH = sheetH + pad * 2 + 34;

    const resizedSheet = await sharp(baked.spritesheetPath)
      .resize(sheetW, sheetH, { kernel: sharp.kernel.lanczos3 })
      .png()
      .toBuffer();

    const cardSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${cardW}" height="${cardH}">
      <rect width="${cardW}" height="${cardH}" rx="18" fill="#0b1120"/>
      <rect x="${pad}" y="${pad + 30}" width="${sheetW}" height="${sheetH}" rx="10" fill="#111827" stroke="rgba(148,163,184,0.22)"/>
      <text x="${pad}" y="38" fill="#e6edf7" font-family="Inter,system-ui,-apple-system,sans-serif" font-size="16" font-weight="700">Baked 2D Codex Pet v2 Spritesheet (1536×2288 lossless WebP · 8×11 cells)</text>
    </svg>`;

    await sharp(Buffer.from(cardSvg))
      .composite([{ input: resizedSheet, left: pad, top: pad + 30 }])
      .png({ compressionLevel: 9 })
      .toFile(path.join(OUT_DIR, "cyber-cat-spritesheet.png"));
  } finally {
    if (existsSync(tmp)) rmSync(tmp, { recursive: true, force: true });
  }
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const manifest = JSON.parse(readFileSync(path.join(ASSET_DIR, "pet-3d.json"), "utf-8"));
  const glbBytes = new Uint8Array(readFileSync(path.join(ASSET_DIR, "model.glb")));
  const glbBase64 = Buffer.from(glbBytes).toString("base64");

  console.log("Rendering 3D hero showcase...");
  await renderHeroShowcase(manifest, glbBase64);
  console.log("Rendering 2D baked spritesheet preview...");
  await renderSpritesheetPreview(manifest, glbBytes);
  console.log("Preview images written to docs/images/");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
