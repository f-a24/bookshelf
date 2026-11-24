/**
 * 背景の図書館を WebGL2 で描く（ライブラリは使わない）。
 *
 * 1. 図書館の絵（scene.frag.glsl）は重いので、表示したときと画面の大きさが
 *    変わったときにだけ、テクスチャに1回描いておく
 * 2. 毎フレームは、その絵にほこりの粒を重ねる軽い処理（composite.frag.glsl）だけを動かす
 *
 * WebGL2 が使えない・シェーダーの準備に失敗した・コンテキストが失われたときは
 * canvas を消して、CSS で描いた図書館をそのまま見せる
 */
import compositeSource from './composite.frag.glsl?raw';
import vertexSource from './fullscreen.vert.glsl?raw';
import sceneSource from './scene.frag.glsl?raw';

/** CSS ピクセルに対する描画解像度の倍率（背景なので低めにして、拡大のぼけも奥行きに見せる） */
const RENDER_SCALE = 0.6;
/** ほこりを動かすフレームレートの上限 */
const FPS = 30;

const compile = (gl: WebGL2RenderingContext, type: number, source: string) => {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(
      gl.getShaderInfoLog(shader) ?? 'シェーダーのコンパイルに失敗',
    );
  }
  return shader;
};

const link = (gl: WebGL2RenderingContext, fragmentSource: string) => {
  const program = gl.createProgram()!;
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, vertexSource));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, fragmentSource));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(
      gl.getProgramInfoLog(program) ?? 'シェーダーのリンクに失敗',
    );
  }
  return program;
};

export const startLibrary = (canvas: HTMLCanvasElement) => {
  const gl = canvas.getContext('webgl2', {
    alpha: false,
    antialias: false,
    depth: false,
    powerPreference: 'low-power',
  });
  if (!gl) {
    canvas.remove();
    return;
  }

  let scene: WebGLProgram;
  let composite: WebGLProgram;
  try {
    scene = link(gl, sceneSource);
    composite = link(gl, compositeSource);
  } catch (error) {
    console.warn('背景の WebGL を使わず、CSS の背景を表示します', error);
    canvas.remove();
    return;
  }

  // 頂点データは使わないが、描画には VAO が1つ必要
  gl.bindVertexArray(gl.createVertexArray());

  const sceneRes = gl.getUniformLocation(scene, 'uRes');
  const compositeRes = gl.getUniformLocation(composite, 'uRes');
  const compositeTime = gl.getUniformLocation(composite, 'uTime');
  const compositeScene = gl.getUniformLocation(composite, 'uScene');

  // 図書館の絵を描いておくテクスチャ
  const texture = gl.createTexture();
  const framebuffer = gl.createFramebuffer();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  /** 画面の大きさに合わせて、図書館の絵を描き直す */
  const renderScene = () => {
    const width = Math.max(1, Math.round(canvas.clientWidth * RENDER_SCALE));
    const height = Math.max(1, Math.round(canvas.clientHeight * RENDER_SCALE));
    canvas.width = width;
    canvas.height = height;

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA8,
      width,
      height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null,
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      texture,
      0,
    );

    gl.viewport(0, 0, width, height);
    gl.useProgram(scene);
    gl.uniform2f(sceneRes, width, height);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  };

  /** 図書館の絵に、ほこりの粒を重ねて画面に出す */
  const drawFrame = (seconds: number) => {
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(composite);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(compositeScene, 0);
    gl.uniform2f(compositeRes, canvas.width, canvas.height);
    gl.uniform1f(compositeTime, seconds);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  // 動きを減らす設定のときは、ほこりを止めた1枚の絵にする
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let frame = 0;
  let last = 0;
  const loop = (now: number) => {
    frame = requestAnimationFrame(loop);
    if (now - last < 1000 / FPS) return;
    last = now;
    drawFrame(now / 1000);
  };
  const start = () => {
    cancelAnimationFrame(frame);
    if (reducedMotion.matches || document.hidden) {
      drawFrame(0);
    } else {
      frame = requestAnimationFrame(loop);
    }
  };

  renderScene();
  drawFrame(0);
  // 描き終わってから、CSS の背景の上にふわっと重ねる
  canvas.dataset.ready = '';
  // 重ね終わったら、下の CSS の部屋を隠す。
  // タブが見えていないとトランジションが進まないことがあるので、時間でも隠す
  const room = canvas.parentElement;
  const hideCssRoom = () => {
    if (room && canvas.isConnected) room.dataset.glShown = '';
  };
  canvas.addEventListener('transitionend', hideCssRoom, { once: true });
  setTimeout(hideCssRoom, 1000);
  start();

  // タブが見えていないときは止める
  document.addEventListener('visibilitychange', start);
  reducedMotion.addEventListener('change', start);

  // 画面の大きさが変わったら、落ち着いてから描き直す（スマホのアドレスバーの出入りなどで連続するため）
  let resizeTimer = 0;
  new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      renderScene();
      drawFrame(performance.now() / 1000);
    }, 200);
  }).observe(canvas);

  // GPU のリセットなどで描けなくなったら、CSS の背景に戻す
  canvas.addEventListener('webglcontextlost', () => {
    cancelAnimationFrame(frame);
    canvas.remove();
    if (room) delete room.dataset.glShown;
  });
};
