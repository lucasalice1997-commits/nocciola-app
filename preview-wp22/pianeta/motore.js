export const identita = () => [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

export function ruota(basi, x, y) {
  const cx = Math.cos(x), sx = Math.sin(x);
  const cy = Math.cos(y), sy = Math.sin(y);
  return basi.map(([a, b, c]) => {
    const z = b * sx + c * cx;
    return [a * cy + z * sy, b * cx - c * sx, z * cy - a * sy];
  });
}

function vettore(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

export function ruotaSulPolo([x, y, z], angolo) {
  const c = Math.cos(angolo), s = Math.sin(angolo);
  return [x.map((v, i) => v * c - z[i] * s), y, z.map((v, i) => x[i] * s + v * c)];
}

function prodotto(a, b) {
  return a.reduce((somma, v, i) => somma + v * b[i], 0);
}

export function riallineaPolo(basi, bersaglio, frazione) {
  const polo = basi[1];
  const traverso = vettore(polo, bersaglio);
  const lunghezza = Math.hypot(...traverso);
  const coseno = Math.max(-1, Math.min(1, prodotto(polo, bersaglio)));
  if (lunghezza < 1e-8 && coseno > 0) return basi;
  const asse = lunghezza < 1e-8 ? basi[0] : unitario(traverso);
  const passo = Math.atan2(lunghezza, coseno) * frazione;
  const c = Math.cos(passo), s = Math.sin(passo);
  return basi.map(v => {
    const perpendicolare = vettore(asse, v);
    const lungoAsse = prodotto(asse, v);
    return v.map((x, i) => x * c + perpendicolare[i] * s + asse[i] * lungoAsse * (1 - c));
  });
}

function unitario(v) {
  const modulo = Math.hypot(...v);
  return v.map(x => x / modulo);
}

export function geometria(scena) {
  const valori = [];
  function vertice(posizione, normale, colore, id) {
    valori.push(...posizione, ...normale, ...colore, id);
  }

  const { anelli, settori } = scena.tessellatura;
  function punto(lat, lon) {
    const t = Math.PI * lat / anelli;
    const p = 2 * Math.PI * (lon % settori) / settori;
    if (lat === 0) return [0, 1, 0];
    if (lat === anelli) return [0, -1, 0];
    return [Math.sin(t) * Math.cos(p), Math.cos(t), Math.sin(t) * Math.sin(p)];
  }

  function triangoloSfera(a, b, c) {
    for (const n of [a, b, c]) vertice(n.map(x => x * scena.raggio), n, scena.colore, 0);
  }
  for (let lat = 0; lat < anelli; lat++) {
    for (let lon = 0; lon < settori; lon++) {
      const a = punto(lat, lon), b = punto(lat + 1, lon);
      const c = punto(lat + 1, lon + 1), d = punto(lat, lon + 1);
      if (lat < anelli - 1) triangoloSfera(a, c, b);
      if (lat > 0) triangoloSfera(a, d, c);
    }
  }

  scena.oggetti.forEach((oggetto, indice) => {
    const su = unitario(oggetto.direzione);
    const asse = Math.abs(su[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const destra = unitario(vettore(asse, su));
    const avanti = vettore(su, destra);
    const w = scena.larghezzaSegnaposto / 2;
    const base = scena.raggio - 0.008;
    const angoli = [[-w, -w], [w, -w], [w, w], [-w, w]].map(([x, y]) =>
      su.map((v, i) => v * base + destra[i] * x + avanti[i] * y)
    );
    const punta = su.map(v => v * (scena.raggio + oggetto.altezza));
    angoli.forEach((a, i) => {
      const b = angoli[(i + 1) % angoli.length];
      const n = unitario(vettore(b.map((v, j) => v - a[j]), punta.map((v, j) => v - a[j])));
      for (const p of [a, b, punta]) vertice(p, n, oggetto.colore, indice + 1);
    });
  });
  return new Float32Array(valori);
}

export const TRIANGOLI_TOPINO = 2;
const SEDE_TOPINO = [18, -21].map(gradi => gradi * Math.PI / 180);
const [latTopino, lonTopino] = SEDE_TOPINO;
const ancoraggioTopino = [Math.cos(latTopino) * Math.sin(lonTopino), Math.sin(latTopino),
  Math.cos(latTopino) * Math.cos(lonTopino)];

const vertexSource = `#version 300 es
layout(location=0) in vec3 posizione;
layout(location=1) in vec3 normale;
layout(location=2) in vec3 tinta;
layout(location=3) in float oggetto;
uniform mat3 rotazione;
uniform vec2 scala;
uniform float distanza;
uniform vec2 profonditaClip;
uniform float idTopino;
uniform vec3 ancoraggio;
out vec3 colore;
out vec3 norm;
out vec3 vista;
out vec3 locale;
flat out float id;
void main() {
  vec3 p = rotazione * posizione;
  if (idTopino > 0.0 && oggetto == idTopino) {
    vec3 radiale = normalize(rotazione * ancoraggio);
    vec2 proiezione = radiale.xy;
    vec2 dir = normalize(vec2(clamp(proiezione.x, -.38, .38), .76 + proiezione.y * .36));
    vec3 su = normalize(vec3(dir, radiale.z * .24));
    vec3 destra = vec3(dir.y, -dir.x, 0.0);
    p = rotazione * ancoraggio + destra * posizione.x + su * posizione.y;
  }
  float profondita = distanza - p.z;
  gl_Position = vec4(p.xy * scala, profonditaClip.x * profondita - profonditaClip.y, profondita);
  vista = vec3(-p.xy, profondita);
  norm = rotazione * normale;
  locale = posizione;
  colore = tinta;
  id = oggetto;
}`;

const fragmentSource = `#version 300 es
precision highp float;
in vec3 colore;
in vec3 norm;
in vec3 vista;
in vec3 locale;
flat in float id;
uniform vec3 direzioneLuce;
uniform vec3 coloreLuce;
uniform vec3 cielo;
uniform vec3 terra;
uniform vec3 coloreBordo;
uniform vec4 parametriLuce;
uniform vec2 fibra;
uniform bool selezione;
uniform float idTopino;
uniform sampler2D ritratto;
out vec4 pixel;
vec3 lineare(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
}
vec3 srgb(vec3 c) {
  return mix(12.92 * c, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}
// Grana stabile nelle coordinate locali. La sfumatura evita tremolio a distanza.
float granello(vec3 cella) {
  vec3 h = fract(cella * vec3(0.1031, 0.1030, 0.0973));
  h += dot(h, h.yzx + 33.33);
  return fract((h.x + h.y) * h.z);
}
float tessuto(vec3 p) {
  vec3 c = floor(p);
  vec3 t = fract(p);
  t = t * t * (3.0 - 2.0 * t);
  float basso = mix(mix(granello(c), granello(c + vec3(1,0,0)), t.x),
    mix(granello(c + vec3(0,1,0)), granello(c + vec3(1,1,0)), t.x), t.y);
  float alto = mix(mix(granello(c + vec3(0,0,1)), granello(c + vec3(1,0,1)), t.x),
    mix(granello(c + vec3(0,1,1)), granello(c + vec3(1,1,1)), t.x), t.y);
  float dettaglio = 1.0 - smoothstep(0.8, 2.4, length(fwidth(p)));
  return (2.0 * mix(basso, alto, t.z) - 1.0) * dettaglio;
}
void main() {
  bool topino = idTopino > 0.0 && id == idTopino;
  vec4 campione;
  if (topino) {
    campione = texture(ritratto, colore.xy);
    if (campione.a < (selezione ? 0.35 : 0.025)) discard;
  }
  if (selezione) {
    pixel = vec4(mod(id, 256.0), floor(id / 256.0), 0.0, 255.0) / 255.0;
  } else if (topino) {
    pixel = campione;
  } else {
    vec3 n = normalize(norm);
    float wrap = parametriLuce.x;
    float diffusa = max(0.0, (dot(n, normalize(direzioneLuce)) + wrap) / (1.0 + wrap));
    vec3 emisferica = mix(lineare(terra), lineare(cielo), 0.5 + 0.5 * n.y);
    vec3 luce = mix(diffusa * lineare(coloreLuce), emisferica, parametriLuce.y);
    float bordo = pow(1.0 - max(0.0, dot(n, normalize(vista))), 3.0) * parametriLuce.w;
    vec3 materia = lineare(colore) * max(vec3(parametriLuce.z), luce);
    if (fibra.x > 0.0) {
      float trama = 0.64 * tessuto(locale * fibra.y * vec3(0.43, 1.0, 0.83))
        + 0.36 * tessuto(locale.zxy * fibra.y * vec3(1.1, 0.54, 1.4) + 17.0);
      materia *= 1.0 + fibra.x * trama;
    }
    pixel = vec4(srgb(clamp(mix(materia, lineare(coloreBordo), bordo), 0.0, 1.0)), 1.0);
  }
}`;

function compila(gl, tipo, sorgente) {
  const shader = gl.createShader(tipo);
  gl.shaderSource(shader, sorgente);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const errore = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(errore);
  }
  return shader;
}

export function creaMotore(canvas, scena, dati = geometria(scena), topino) {
  const gl = canvas.getContext("webgl2", { antialias: true, alpha: true });
  if (!gl) throw new Error("WebGL2");
  const programma = gl.createProgram();
  let vertex, fragment;
  try {
    vertex = compila(gl, gl.VERTEX_SHADER, vertexSource);
    fragment = compila(gl, gl.FRAGMENT_SHADER, fragmentSource);
    gl.attachShader(programma, vertex);
    gl.attachShader(programma, fragment);
    gl.linkProgram(programma);
    if (!gl.getProgramParameter(programma, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(programma));
    }
  } catch (error) {
    gl.deleteProgram(programma);
    throw error;
  } finally {
    if (vertex) gl.deleteShader(vertex);
    if (fragment) gl.deleteShader(fragment);
  }
  gl.useProgram(programma);
  const idTopino = topino ? scena.oggetti.length + 1 : 0;
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  if (topino) {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, topino);
    gl.generateMipmap(gl.TEXTURE_2D);
  } else {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
  }
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, topino ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.uniform1f(gl.getUniformLocation(programma, "idTopino"), idTopino);
  gl.uniform3fv(gl.getUniformLocation(programma, "ancoraggio"), ancoraggioTopino.map(x => x * scena.raggio * 1.004));
  const oggetti = topino ? [...scena.oggetti, { id: "animal.topino", etichetta: ["Nocciola · topino", "Nocciola · mouse"] }] : scena.oggetti;
  const verticiScena = dati.length / 10;
  let vertici = dati;
  if (topino) {
    const altezza = scena.raggio * .34, meta = altezza * topino.width / topino.height / 2;
    const angoli = [[-meta, 0, 0, 1], [meta, 0, 1, 1], [meta, altezza, 1, 0], [-meta, altezza, 0, 0]];
    vertici = new Float32Array(dati.length + TRIANGOLI_TOPINO * 30);
    vertici.set(dati);
    [0, 1, 2, 0, 2, 3].forEach((indice, n) => {
      const [x, y, u, v] = angoli[indice];
      vertici.set([x, y, 0, 0, 0, 1, u, v, 0, idTopino], dati.length + n * 10);
    });
  }
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, vertici, gl.STATIC_DRAW);
  [0, 1, 2, 3].forEach((indice) => {
    gl.enableVertexAttribArray(indice);
    gl.vertexAttribPointer(indice, indice === 3 ? 1 : 3, gl.FLOAT, false, 40, indice * 12);
  });

  const rotazione = gl.getUniformLocation(programma, "rotazione");
  const scala = gl.getUniformLocation(programma, "scala");
  const selezione = gl.getUniformLocation(programma, "selezione");
  const { camera, raggio, luce } = scena;
  const vicina = raggio * 0.1, lontana = raggio * (camera.distanza + 4);
  gl.uniform1f(gl.getUniformLocation(programma, "distanza"), camera.distanza * raggio);
  gl.uniform2f(gl.getUniformLocation(programma, "profonditaClip"),
    (lontana + vicina) / (lontana - vicina), 2 * lontana * vicina / (lontana - vicina));
  const focale = 1 / Math.tan(camera.fov * Math.PI / 360);
  for (const [nome, valore] of Object.entries({
    direzioneLuce: luce.direzione, coloreLuce: luce.colore, cielo: luce.cielo,
    terra: luce.terra, coloreBordo: luce.bordo.colore,
  })) gl.uniform3fv(gl.getUniformLocation(programma, nome), valore);
  gl.uniform4f(gl.getUniformLocation(programma, "parametriLuce"),
    luce.wrap, luce.pesoEmisferico, luce.minimo, luce.bordo.intensita);
  gl.uniform2fv(gl.getUniformLocation(programma, "fibra"), scena.fibra ?? [0, 0]);
  gl.enable(gl.DEPTH_TEST);
  gl.disable(gl.DITHER);

  // Il passaggio di selezione usa un framebuffer senza multisampling.
  // Anche sul bordo di un oggetto il colore letto corrisponde a un solo ID.
  const framebuffer = gl.createFramebuffer();
  const colore = gl.createRenderbuffer();
  const profondita = gl.createRenderbuffer();
  let larghezzaPick = 0, altezzaPick = 0;

  function disegna(basi, zoom, scegli = false) {
    const { width, height } = canvas;
    const lato = Math.min(width, height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, scegli ? framebuffer : null);
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.uniformMatrix3fv(rotazione, false, basi.flat());
    gl.uniform2f(scala, focale * lato / (zoom * width), focale * lato / (zoom * height));
    gl.uniform1i(selezione, Number(scegli));
    gl.drawArrays(gl.TRIANGLES, 0, verticiScena);
    if (topino) {
      if (!scegli) {
        gl.enable(gl.BLEND);
        gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      }
      gl.drawArrays(gl.TRIANGLES, verticiScena, TRIANGOLI_TOPINO * 3);
      if (!scegli) gl.disable(gl.BLEND);
    }
  }

  return {
    disegna,
    seleziona(basi, zoom, x, y, densita = 1) {
      const { width, height } = canvas;
      if (x < 0 || x >= 1 || y < 0 || y >= 1) return undefined;
      if (width !== larghezzaPick || height !== altezzaPick) {
        gl.bindRenderbuffer(gl.RENDERBUFFER, colore);
        gl.renderbufferStorage(gl.RENDERBUFFER, gl.RGBA8, width, height);
        gl.bindRenderbuffer(gl.RENDERBUFFER, profondita);
        gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, width, height);
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, colore);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, profondita);
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
          gl.bindFramebuffer(gl.FRAMEBUFFER, null);
          return undefined;
        }
        larghezzaPick = width;
        altezzaPick = height;
      }
      disegna(basi, zoom, true);
      const centroX = Math.floor(x * width), centroY = height - 1 - Math.floor(y * height);
      const r = Math.round(scena.selezioneRaggioCss * densita);
      const sinistra = Math.max(0, centroX - r), basso = Math.max(0, centroY - r);
      const w = Math.min(width, centroX + r + 1) - sinistra;
      const h = Math.min(height, centroY + r + 1) - basso;
      const pixel = new Uint8Array(w * h * 4);
      gl.readPixels(sinistra, basso, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      let migliore = 0, distanzaMinima = Infinity;
      for (let i = 0; i < w * h; i++) {
        const id = pixel[i * 4] | (pixel[i * 4 + 1] << 8);
        if (!id) continue;
        const dx = sinistra + i % w - centroX, dy = basso + Math.floor(i / w) - centroY;
        const distanza = dx * dx + dy * dy;
        if (distanza < distanzaMinima) {
          migliore = id;
          distanzaMinima = distanza;
        }
      }
      return oggetti[migliore - 1];
    },
    elimina() {
      gl.deleteRenderbuffer(colore);
      gl.deleteRenderbuffer(profondita);
      gl.deleteFramebuffer(framebuffer);
      gl.deleteTexture(texture);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(programma);
    },
  };
}
