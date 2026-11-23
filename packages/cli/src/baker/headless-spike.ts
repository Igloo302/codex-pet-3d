import puppeteer from "puppeteer";
import {
  bundleBrowserScript,
  getSwiftShaderArgs,
  resolveExecutablePath,
} from "./browser-utils.js";

export interface HeadlessRenderResult {
  data: Uint8Array;
  hasAlpha: boolean;
  width: number;
  height: number;
}

interface BrowserRenderResult {
  dataBase64: string;
  width: number;
  height: number;
}

/**
 * Browser-side renderer. esbuild bundles this (with Three.js + GLTFLoader)
 * into a single IIFE that is injected into the page via `addScriptTag`.
 */
const BROWSER_SOURCE = `
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

function decodeBase64(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function encodeBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

window.__renderHeadlessFrame = async function (glbBase64, width, height) {
  const canvas = document.getElementById("gl-canvas");
  const renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    alpha: true,
    antialias: true,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
  camera.position.set(0, 1.2, 2.5);
  camera.lookAt(0, 0.4, 0);
  scene.add(new THREE.AmbientLight(0xffffff, 1.5));
  const keyLight = new THREE.DirectionalLight(0xffffff, 2.0);
  keyLight.position.set(3, 4, 5);
  scene.add(keyLight);

  const glbBytes = decodeBase64(glbBase64);
  const loader = new GLTFLoader();
  const gltf = await new Promise((resolve, reject) => {
    loader.parse(glbBytes.buffer, "", resolve, reject);
  });
  scene.add(gltf.scene);

  renderer.render(scene, camera);

  const gl = renderer.getContext();
  const raw = new Uint8Array(width * height * 4);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, raw);

  // readPixels is bottom-up; flip to a conventional top-down RGBA frame.
  const pixels = new Uint8Array(raw.length);
  const rowBytes = width * 4;
  for (let y = 0; y < height; y++) {
    const src = (height - 1 - y) * rowBytes;
    pixels.set(raw.subarray(src, src + rowBytes), y * rowBytes);
  }

  renderer.dispose();
  return {
    dataBase64: encodeBase64(pixels),
    width: width,
    height: height,
  };
};
`;

/**
 * Render a GLB model to a transparent RGBA frame using headless Chromium with
 * SwiftShader software WebGL 2. Works without a display server or hardware GPU.
 */
export async function renderHeadlessFrame(
  glbBytes: Uint8Array,
  width: number,
  height: number
): Promise<HeadlessRenderResult> {
  const bundle = await bundleBrowserScript(
    BROWSER_SOURCE,
    "headless-render-entry.js"
  );
  const executablePath = resolveExecutablePath();
  const browser = await puppeteer.launch({
    headless: true,
    args: getSwiftShaderArgs(),
    ...(executablePath ? { executablePath } : {}),
  });

  try {
    const page = await browser.newPage();
    await page.setContent(
      '<!doctype html><html><body style="margin:0;padding:0">' +
        `<canvas id="gl-canvas" width="${width}" height="${height}"></canvas>` +
        "</body></html>"
    );
    await page.addScriptTag({ content: bundle });

    const glbBase64 = Buffer.from(glbBytes).toString("base64");
    const rendered = await page.evaluate(
      async (args) => {
        const render = (
          window as unknown as {
            __renderHeadlessFrame: (
              glbBase64: string,
              width: number,
              height: number
            ) => Promise<BrowserRenderResult>;
          }
        ).__renderHeadlessFrame;
        return render(args.glbBase64, args.width, args.height);
      },
      { glbBase64, width, height }
    );

    const data = new Uint8Array(Buffer.from(rendered.dataBase64, "base64"));
    const expected = width * height * 4;
    if (data.byteLength !== expected) {
      throw new Error(
        `Expected ${expected} RGBA bytes, received ${data.byteLength}`
      );
    }

    let hasTransparent = false;
    let hasOpaque = false;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] === 0) hasTransparent = true;
      else hasOpaque = true;
    }

    return {
      data,
      hasAlpha: hasTransparent && hasOpaque,
      width: rendered.width,
      height: rendered.height,
    };
  } finally {
    await browser.close();
  }
}
