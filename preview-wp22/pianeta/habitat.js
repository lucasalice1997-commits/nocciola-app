import { scena as prototipo } from "./manifesto.js";
import { geometria, TRIANGOLI_TOPINO } from "./motore.js";

// Taratura provvisoria WP2: RGB sRGB del prato, intensità e frequenza della fibra.
const base = { ...prototipo, colore: [0.55, 0.64, 0.31], fibra: [0.30, 215], tessellatura: { anelli: 28, settori: 56 } };

const nomiInglesi = {
  "terrain.stone": "Stone", "terrain.moss": "Moss", "terrain.path": "Path",
  "building.tana": "Den", "fence.recinzione": "Fence", "plant.carota": "Carrot",
  "plant.tife": "Cattails", "building.pollaio": "Chicken coop", "tree.melo": "Apple tree",
  "prop.cesto": "Apple basket", "plant.cavolo": "Cabbage",
  "plant.lattuga": "Lettuce", "plant.pomodoro": "Tomato", "plant.fagiolo": "Bean",
  "plant.pisello": "Pea", "plant.grano": "Wheat", "animal.gallina": "Hen", "animal.mucca": "Cow", "animal.maiale": "Pig", "animal.pecora": "Sheep", "prop.nido": "Nest with eggs",
  "terrain.earth": "Soil", "terrain.water": "Pond", "terrain.root": "Root", "terrain.wood": "Wood",
};

const unitario = v => {
  const m = Math.hypot(...v);
  return v.map(x => x / m);
};
const vettore = ([a,b,c], [x,y,z]) => [b*z-c*y, c*x-a*z, a*y-b*x];

export function leggiMaglia(bytes) {
  const vista = new DataView(bytes);
  // Il lotto contiene esclusivamente GLB statici, con un chunk JSON e un BIN.
  if (bytes.byteLength < 28 || vista.getUint32(0, true) !== 0x46546c67 ||
      vista.getUint32(4, true) !== 2 || vista.getUint32(8, true) !== bytes.byteLength ||
      vista.getUint32(16, true) !== 0x4e4f534a) throw Error("Intestazione GLB non valida");
  const lunghezza = vista.getUint32(12, true);
  const bin = 28 + lunghezza;
  if (bin > bytes.byteLength || bin % 4 || vista.getUint32(bin - 4, true) !== 0x004e4942 ||
      vista.getUint32(bin - 8, true) !== bytes.byteLength - bin) throw Error("Chunk GLB non validi");

  const doc = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes, 20, lunghezza)));
  const [maglia] = doc.meshes;
  const [primitiva] = maglia.primitives;
  if (doc.meshes.length !== 1 || maglia.primitives.length !== 1 || primitiva.indices !== undefined ||
      (primitiva.mode ?? 4) !== 4) throw Error("La prova richiede una maglia di triangoli senza indici");

  function attributo(nome) {
    const a = doc.accessors[primitiva.attributes[nome]];
    const view = doc.bufferViews[a.bufferView];
    const offset = (a.byteOffset ?? 0) + (view.byteOffset ?? 0);
    if (view.buffer !== 0 || view.byteStride || a.sparse || a.componentType !== 5126 ||
        a.type !== "VEC3" || !Number.isInteger(a.count) || a.count < 3 || a.count % 3 ||
        !Number.isInteger(offset) || offset < 0 || offset % 4 ||
        (a.byteOffset ?? 0) + a.count * 12 > view.byteLength || bin + offset + a.count * 12 > bytes.byteLength) {
      throw Error("Attributo statico GLB incompatibile");
    }
    const valori = new Float32Array(bytes, bin + offset, a.count * 3);
    if (!valori.every(Number.isFinite)) throw Error("Attributo GLB non finito");
    return valori;
  }
  const posizioni = attributo("POSITION"), normali = attributo("NORMAL");
  if (posizioni.length !== normali.length) throw Error("Le normali non corrispondono ai vertici");
  const materiale = doc.materials[primitiva.material].pbrMetallicRoughness;
  const srgb = c => c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
  const baseColore = materiale.baseColorFactor.slice(0, 3);
  const colore = baseColore.map(srgb);
  const tinta = primitiva.attributes.COLOR_0 === undefined ? null : attributo("COLOR_0");
  if (tinta && tinta.length !== posizioni.length) throw Error("Colori non corrispondenti ai vertici");
  if (tinta) tinta.forEach((v,i) => { tinta[i] = srgb(v * baseColore[i % 3]); });
  return { posizioni, normali, colore, tinta };
}

// Mappa degli habitat (strumenti/genera_mappa_habitat.py): lat/lon in gradi, +Y nord, +Z fronte.
const vettoreDa = (lat, lon) => {
  const a = lat * Math.PI / 180, b = lon * Math.PI / 180;
  return [Math.cos(a) * Math.sin(b), Math.sin(a), Math.cos(a) * Math.cos(b)];
};

export async function caricaLotto(cartella = new URL("./asset/", import.meta.url)) {
  async function documento(nome) {
    const risposta = await fetch(new URL(nome, cartella));
    if (!risposta.ok) throw Error("Documento del lotto non disponibile: " + nome);
    return risposta.json();
  }
  const { schemaVersion, assets } = await documento("manifesto.json");
  if (schemaVersion !== 1 || !Array.isArray(assets) || assets.length < 7 || assets.length > 40) throw Error("Manifesto del lotto inatteso");
  const mappa = await documento("habitat-map.json");
  const budget = mappa.budget;
  if (mappa.schemaVersion !== 1 || !Array.isArray(mappa.istanze) || !budget
      || !Number.isInteger(budget.istanze_max) || budget.istanze_max < 6 || budget.istanze_max > 260
      || !Number.isInteger(budget.triangoli_max) || budget.triangoli_max < 1 || budget.triangoli_max > 16000
      || mappa.istanze.length < 6 || mappa.istanze.length + 1 > budget.istanze_max
      || mappa.istanze.some(i => !i || typeof i.id !== "string"
        || !Number.isFinite(i.lat) || Math.abs(i.lat) > 90
        || !Number.isFinite(i.lon) || Math.abs(i.lon) > 180
        || !Number.isFinite(i.yaw) || i.yaw < 0 || i.yaw >= 360
        || !Number.isFinite(i.scala) || i.scala <= 0)) {
    throw Error("Mappa degli habitat inattesa");
  }
  const risorse = new Map(await Promise.all(assets.map(async asset => {
    if (!asset || typeof asset.id !== "string" || !/^[a-z]+[.][a-z]+$/.test(asset.id)
        || !Number.isFinite(asset.scala) || asset.scala <= 0
        || !Array.isArray(asset.ancoraggio) || asset.ancoraggio.length !== 3 || !asset.ancoraggio.every(Number.isFinite)
        || !["segnaposto", "bozza"].includes(asset.approvazione) || !/^[a-z]+\.glb$/.test(asset.modello)) {
      throw Error("Risorsa non prevista nel lotto");
    }
    const risposta = await fetch(new URL(asset.modello, cartella));
    if (!risposta.ok) throw Error("Modello mancante: " + asset.modello);
    return [asset.id, { asset, ...leggiMaglia(await risposta.arrayBuffer()) }];
  })));
  if (risorse.size !== assets.length) throw Error("ID degli asset duplicati");
  const sfera = geometria({ ...base, oggetti: [] });
  const istanze = mappa.istanze.map(({ id, lat, lon, yaw, scala }) => {
    if (!risorse.has(id)) throw Error("Asset della mappa sconosciuto: " + id);
    if (!Number.isFinite(risorse.get(id).asset.scala * scala)) throw Error("Scala composta non finita");
    return { ...risorse.get(id), direzione: vettoreDa(lat, lon), yaw: yaw * Math.PI / 180, fattore: scala };
  });
  const triangoli = istanze.reduce((totale, i) => totale + i.posizioni.length / 9, 0);
  if (triangoli > mappa.budget.triangoli_max || triangoli + sfera.length / 30 + TRIANGOLI_TOPINO > 16000 || istanze.length + 1 > Math.min(260, mappa.budget.istanze_max)) {
    throw Error("Budget della scena superato");
  }
  const dati = new Float32Array(sfera.length + triangoli * 30);
  dati.set(sfera);
  let offset = sfera.length;
  const oggetti = istanze.map(({ asset, direzione, yaw, fattore, posizioni, normali, colore, tinta }, indice) => {
    const su = unitario(direzione);
    const riferimento = Math.abs(su[1]) > 0.9 ? [0, 0, 1] : [0, 1, 0];
    const destra = unitario(vettore(su, riferimento));
    const nord = vettore(destra, su);
    // yaw: rotazione oraria vista da fuori; 0 = asse lungo dell'asset verso il nord locale.
    const fronte = nord.map((v, j) => Math.cos(yaw) * v - Math.sin(yaw) * destra[j]);
    const lato = destra.map((v, j) => Math.cos(yaw) * v + Math.sin(yaw) * nord[j]);
    const scala = asset.scala * fattore;
    const [ax, ay, az] = asset.ancoraggio;
    for (let i = 0; i < posizioni.length; i += 3) {
      const x = (posizioni[i] - ax) * scala, z = (posizioni[i + 2] - az) * scala;
      const altezza = (posizioni[i + 1] - ay) * scala;
      const superficie = unitario(su.map((v, j) => v + (x * lato[j] + z * fronte[j]) / base.raggio));
      const posizione = superficie.map(v => v * (base.raggio + altezza));
      const normale = superficie.map((v,j) => normali[i] * lato[j] + normali[i+1] * v + normali[i+2] * fronte[j]);
      dati.set([...posizione, ...normale, ...(tinta ? tinta.subarray(i, i + 3) : colore), indice + 1], offset);
      offset += 10;
    }
    return { id: indice + 1 + ":" + asset.id, etichetta: [asset.etichetta, nomiInglesi[asset.id] ?? asset.etichetta] };
  });
  if (!dati.every(Number.isFinite)) throw Error("Geometria non rappresentabile in Float32");
  return { scena: { ...base, oggetti }, dati, triangoli, mappa };
}
