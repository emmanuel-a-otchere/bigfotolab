<template>
  <div ref="containerRef" class="absolute inset-0 overflow-hidden bg-black">
    <canvas
      ref="canvasRef"
      class="block h-full w-full cursor-grab active:cursor-grabbing"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @wheel.prevent="onWheel"
      @contextmenu.prevent
    ></canvas>
    <video
      v-if="isVideo"
      ref="videoRef"
      :src="src"
      class="hidden"
      crossorigin="anonymous"
      playsinline
      loop
      preload="auto"
    ></video>
    <button
      v-if="isVideo"
      type="button"
      class="absolute left-1/2 top-1/2 z-10 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-base-100/70 text-base-content shadow hover:bg-base-100"
      @click.stop="togglePlay"
      @dblclick.stop
    >
      <span class="text-2xl leading-none">{{ playing ? '❚❚' : '▶' }}</span>
    </button>
    <div
      v-if="loadError"
      class="absolute inset-x-0 bottom-4 z-10 mx-auto w-fit rounded-box bg-base-100/80 px-4 py-2 text-sm text-base-content"
    >
      {{ t('image_viewer.media_server_unavailable') }}
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps({
  src: { type: String, required: true },
  isVideo: { type: Boolean, default: false }
});

const { t } = useI18n();
const containerRef = ref(null);
const canvasRef = ref(null);
const videoRef = ref(null);

const yaw = ref(0);
const pitch = ref(0);
const fov = ref(75);
const playing = ref(false);
const loadError = ref(false);

let gl = null;
let program = null;
let texture = null;
let bitmap = null;
let rafId = 0;
let dragging = false;
let lastX = 0;
let lastY = 0;
let videoLoop = false;

const VERT = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FRAG = `
precision mediump float;
varying vec2 v_uv;
uniform sampler2D u_tex;
uniform float u_yaw;
uniform float u_pitch;
uniform float u_fov;
uniform float u_aspect;
const float PI = 3.14159265359;
void main() {
  float halfFov = u_fov * PI / 360.0;
  vec2 p = (v_uv * 2.0 - 1.0) * vec2(tan(halfFov) * u_aspect, tan(halfFov));
  float cy = cos(u_yaw);
  float sy = sin(u_yaw);
  float cp = cos(u_pitch);
  float sp = sin(u_pitch);
  vec3 forward = vec3(sy * cp, sp, cy * cp);
  vec3 right = vec3(cy, 0.0, -sy);
  vec3 up = cross(right, forward);
  vec3 dir = normalize(forward + p.x * right - p.y * up);
  float u = atan(dir.z, dir.x) / (2.0 * PI) + 0.5;
  float v = asin(clamp(dir.y, -1.0, 1.0)) / PI + 0.5;
  gl_FragColor = texture2D(u_tex, vec2(u, v));
}`;

function compile(type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) || 'shader error');
  }
  return shader;
}

function initGl() {
  const canvas = canvasRef.value;
  gl = canvas.getContext('webgl', { antialias: true, alpha: false });
  if (!gl) {
    loadError.value = true;
    return;
  }
  program = gl.createProgram();
  gl.attachShader(program, compile(gl.VERTEX_SHADER, VERT));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    loadError.value = true;
    return;
  }
  gl.useProgram(program);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(program, 'a_pos');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.uniform1i(gl.getUniformLocation(program, 'u_tex'), 0);
}

function resize() {
  const canvas = canvasRef.value;
  const container = containerRef.value;
  if (!canvas || !container) return;
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(1, Math.floor(container.clientWidth * dpr));
  const h = Math.max(1, Math.floor(container.clientHeight * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
}

function render() {
  if (!gl || !program) return;
  resize();
  gl.viewport(0, 0, canvasRef.value.width, canvasRef.value.height);
  gl.useProgram(program);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  if (props.isVideo && videoRef.value && videoRef.value.readyState >= 2) {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, videoRef.value);
  } else if (bitmap) {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);
  } else {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([16, 16, 16, 255]));
  }
  gl.uniform1f(gl.getUniformLocation(program, 'u_yaw'), yaw.value);
  gl.uniform1f(gl.getUniformLocation(program, 'u_pitch'), pitch.value);
  gl.uniform1f(gl.getUniformLocation(program, 'u_fov'), fov.value);
  gl.uniform1f(gl.getUniformLocation(program, 'u_aspect'), canvasRef.value.width / canvasRef.value.height);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

function loop() {
  render();
  if (videoLoop) rafId = requestAnimationFrame(loop);
}

function requestRender() {
  if (props.isVideo && videoLoop) return;
  cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(render);
}

async function loadImage() {
  loadError.value = false;
  try {
    const res = await fetch(props.src);
    if (!res.ok) throw new Error(String(res.status));
    const blob = await res.blob();
    bitmap = await createImageBitmap(blob);
    requestRender();
  } catch (e) {
    loadError.value = true;
  }
}

function onPointerDown(e) {
  dragging = true;
  lastX = e.clientX;
  lastY = e.clientY;
  canvasRef.value?.setPointerCapture(e.pointerId);
}

function onPointerMove(e) {
  if (!dragging) return;
  const dx = e.clientX - lastX;
  const dy = e.clientY - lastY;
  lastX = e.clientX;
  lastY = e.clientY;
  yaw.value -= dx * 0.005;
  pitch.value = Math.max(-1.45, Math.min(1.45, pitch.value + dy * 0.005));
  requestRender();
}

function onPointerUp(e) {
  dragging = false;
  canvasRef.value?.releasePointerCapture?.(e.pointerId);
}

function onWheel(e) {
  fov.value = Math.max(30, Math.min(120, fov.value * Math.exp(e.deltaY * 0.001)));
  requestRender();
}

async function togglePlay() {
  const v = videoRef.value;
  if (!v) return;
  if (v.paused) {
    try {
      await v.play();
      playing.value = true;
      videoLoop = true;
      loop();
    } catch (e) {
      loadError.value = true;
    }
  } else {
    v.pause();
    playing.value = false;
    videoLoop = false;
    cancelAnimationFrame(rafId);
    render();
  }
}

let resizeObserver = null;

onMounted(() => {
  initGl();
  if (props.isVideo) {
    const v = videoRef.value;
    if (v) {
      v.addEventListener('loadeddata', () => requestRender());
      v.addEventListener('error', () => { loadError.value = true; });
    }
  } else {
    loadImage();
  }
  resizeObserver = new ResizeObserver(() => requestRender());
  if (containerRef.value) resizeObserver.observe(containerRef.value);
});

onBeforeUnmount(() => {
  cancelAnimationFrame(rafId);
  resizeObserver?.disconnect();
  if (videoRef.value) videoRef.value.pause();
  if (gl && texture) gl.deleteTexture(texture);
  if (gl && program) gl.deleteProgram(program);
});

watch(() => props.src, () => {
  if (props.isVideo) {
    videoLoop = false;
    playing.value = false;
    cancelAnimationFrame(rafId);
    loadError.value = false;
    requestRender();
  } else {
    bitmap = null;
    loadImage();
  }
});
</script>
