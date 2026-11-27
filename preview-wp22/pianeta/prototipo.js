import { scena as scenaBase } from "./manifesto.js";
import { creaMotore, identita, riallineaPolo, ruota, ruotaSulPolo } from "./motore.js";

async function ritrattoTopino({ src, rect }) {
  const immagine = new Image();
  immagine.src = src;
  await immagine.decode();
  const [x, y, width, height] = rect;
  const ritratto = Object.assign(document.createElement("canvas"), { width, height });
  ritratto.getContext("2d").drawImage(immagine, x, y, width, height, 0, 0, width, height);
  return ritratto;
}

export async function montaPianeta(tana, lingua, configurazione, atlanteTopino) {
  const topino = tana.dataset.habitat === "true" && atlanteTopino ? ritrattoTopino(atlanteTopino).catch(() => null) : null;
  if (!configurazione && tana.dataset.habitat === "true") {
    const { caricaLotto } = await import("./habitat.js");
    configurazione = await caricaLotto();
  }
  const { scena = scenaBase, dati } = configurazione ?? {};
  const ritratto = await topino;
  const testo = (it, en) => lingua() === "en" ? en : it;
  const sezione = document.createElement("section");
  sezione.id = "pianeta-prototipo";
  sezione.className = "card";
  const titolo = document.createElement("h3");
  titolo.textContent = testo("Pianeta-Dispensa · prova tecnica", "Pantry Planet · technical preview");
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "display:block;width:100%;aspect-ratio:1/1;height:auto;touch-action:none;border-radius:0.7rem";
  canvas.tabIndex = 0;
  canvas.setAttribute("aria-label", testo("Pianeta 3D. Frecce per ruotare, + e − per lo zoom, Invio per selezionare al centro.",
    "3D planet. Arrow keys to rotate, + and − to zoom, Enter to select at the center."));
  const comandi = document.createElement("div");
  const stato = document.createElement("p");
  stato.setAttribute("role", "status");
  const tema = matchMedia("(prefers-color-scheme: dark)");
  const radice = document.documentElement;
  function aggiornaSfondo() {
    const scuro = radice.dataset.theme === "dark" || (!radice.dataset.theme && tema.matches);
    canvas.style.background = scuro ? scena.sfondo.scuro : `linear-gradient(${scena.sfondo.chiaro.join(", ")})`;
  }
  aggiornaSfondo();
  tema.addEventListener("change", aggiornaSfondo);
  new MutationObserver(aggiornaSfondo).observe(radice, { attributes: true, attributeFilter: ["data-theme"] });
  const movimento = matchMedia("(prefers-reduced-motion: reduce)");

  function pulsante(it, en, azione) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "btn ghost";
    b.textContent = testo(it, en);
    b.addEventListener("click", azione);
    comandi.append(b);
    return b;
  }

  const orientamento = ruota(identita(), scena.camera.inclinazione * Math.PI / 180, 0);
  let motore, basi = orientamento, zoom = scena.zoom.iniziale;
  let automatico = !movimento.matches, selezionato, frame = 0, prima = 0, ultimaAzione = -Infinity;
  let velocitaX = 0, velocitaY = 0, ultimaMossa = 0, trascinato = false;
  const puntatori = new Map();
  const pausa = pulsante("Pausa rotazione", "Pause rotation", () => {
    automatico = !automatico;
    aggiornaPulsante();
    aggiorna();
  });
  function aggiornaPulsante() {
    pausa.textContent = automatico ? testo("Pausa rotazione", "Pause rotation") : testo("Avvia rotazione", "Start rotation");
    pausa.disabled = movimento.matches;
  }
  aggiornaPulsante();
  pulsante("Ingrandisci", "Zoom in", () => cambiaZoom(0.85));
  pulsante("Riduci", "Zoom out", () => cambiaZoom(1.18));
  pulsante("Riprendi esplorazione", "Resume exploring", () => {
    selezionato = undefined;
    stato.textContent = "";
    interazione();
    aggiorna();
  }).disabled = true;
  const riprendi = comandi.lastElementChild;

  sezione.append(titolo, canvas, comandi, stato);
  tana.insertBefore(sezione, tana.querySelector("#tana"));

  function errore() {
    delete tana.dataset.topinoPianeta;
    canvas.hidden = true;
    canvas.style.display = "none";
    comandi.hidden = true;
    stato.textContent = testo("Anteprima 3D non disponibile.", "3D preview unavailable.");
  }

  function visibile() {
    return !tana.hidden && !document.hidden;
  }

  function interazione() {
    ultimaAzione = performance.now();
    velocitaX = 0;
    velocitaY = 0;
  }

  function aggiorna() {
    if (!motore || !visibile()) {
      cancelAnimationFrame(frame);
      frame = 0;
      prima = 0;
      return;
    }
    if (!frame) frame = requestAnimationFrame(disegna);
  }

  function disegna(ora) {
    frame = 0;
    if (!motore || !visibile()) {
      prima = 0;
      return;
    }
    const dt = prima ? Math.min((ora - prima) / 1000, 0.05) : 0;
    prima = ora;
    if (!puntatori.size && !selezionato && !movimento.matches) {
      if (Math.hypot(velocitaX, velocitaY) > 0.01) {
        basi = ruota(basi, velocitaX * dt, velocitaY * dt);
        const freno = Math.exp(-7 * dt);
        velocitaX *= freno;
        velocitaY *= freno;
      } else if (automatico) {
        const ripresa = Math.max(0, Math.min(1, (ora - ultimaAzione - scena.ripresaMs) / 900));
        if (ripresa > 0) {
          basi = riallineaPolo(basi, orientamento[1],
            1 - Math.exp(-scena.camera.riallineamento * dt * ripresa));
          const fattoreZoom = Math.min(1, zoom / scena.zoom.iniziale);
          basi = ruotaSulPolo(basi, scena.velocita * dt * ripresa * fattoreZoom);
        }
      }
    }
    const misura = canvas.getBoundingClientRect();
    const densita = Math.min(devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(misura.width * densita)), h = Math.max(1, Math.round(misura.height * densita));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    motore.disegna(basi, zoom);
    if (ritratto && !tana.hasAttribute("data-topino-pianeta")) tana.dataset.topinoPianeta = "true";

    if (!puntatori.size && !selezionato && !movimento.matches &&
        (automatico || Math.hypot(velocitaX, velocitaY) > 0.01)) {
      aggiorna();
    } else {
      prima = 0;
    }
  }

  function cambiaZoom(fattore) {
    interazione();
    zoom = Math.max(scena.zoom.minimo, Math.min(scena.zoom.massimo, zoom * fattore));
    aggiorna();
  }

  function scegli(x, y) {
    selezionato = motore?.seleziona(basi, zoom, x, y, canvas.width / Math.max(1, canvas.clientWidth));
    stato.textContent = selezionato ? testo(...selezionato.etichetta) : "";
    riprendi.disabled = !selezionato;
    aggiorna();
  }

  canvas.addEventListener("pointerdown", evento => {
    if (!motore || evento.button !== 0 || puntatori.size === 2) return;
    if (!puntatori.size) trascinato = false;
    if (puntatori.size) trascinato = true;
    interazione();
    ultimaMossa = performance.now();
    puntatori.set(evento.pointerId, [evento.clientX, evento.clientY]);
    canvas.setPointerCapture(evento.pointerId);
  });

  canvas.addEventListener("pointermove", evento => {
    const primaPosizione = puntatori.get(evento.pointerId);
    if (!primaPosizione) return;
    const dopo = [evento.clientX, evento.clientY];
    const dx = dopo[0] - primaPosizione[0], dy = dopo[1] - primaPosizione[1];
    if (!trascinato && Math.hypot(dx, dy) < 4) return;
    trascinato = true;
    const ora = performance.now();
    const dt = Math.max(16, ora - ultimaMossa) / 1000;
    ultimaMossa = ora;
    interazione();
    puntatori.set(evento.pointerId, dopo);
    if (puntatori.size === 2) {
      const altro = [...puntatori.entries()].find(([id]) => id !== evento.pointerId)[1];
      const distanza = Math.hypot(dopo[0] - altro[0], dopo[1] - altro[1]);
      const precedente = Math.hypot(primaPosizione[0] - altro[0], primaPosizione[1] - altro[1]);
      if (distanza > 0 && precedente > 0) cambiaZoom(precedente / distanza);
    } else {
      const unita = Math.PI / Math.max(1, canvas.clientHeight);
      basi = ruota(basi, dy * unita, dx * unita);
      velocitaX = Math.max(-3, Math.min(3, dy * unita / dt));
      velocitaY = Math.max(-3, Math.min(3, dx * unita / dt));
    }
    aggiorna();
  });

  function rilascia(evento) {
    if (!puntatori.delete(evento.pointerId)) return;
    ultimaAzione = performance.now();
    if (evento.type !== "pointerup" || ultimaAzione - ultimaMossa > 100) interazione();
    if (!puntatori.size && !trascinato && evento.type === "pointerup") {
      const rett = canvas.getBoundingClientRect();
      scegli((evento.clientX - rett.left) / rett.width, (evento.clientY - rett.top) / rett.height);
    }
    aggiorna();
  }

  for (const nome of ["pointerup", "pointercancel", "lostpointercapture"]) canvas.addEventListener(nome, rilascia);
  canvas.addEventListener("wheel", evento => {
    if (!evento.ctrlKey) return;
    evento.preventDefault();
    cambiaZoom(Math.exp(Math.max(-120, Math.min(120, evento.deltaY)) * 0.005));
  }, { passive: false });

  canvas.addEventListener("keydown", evento => {
    const passi = { ArrowUp: [-0.15, 0], ArrowDown: [0.15, 0], ArrowLeft: [0, -0.15], ArrowRight: [0, 0.15] };
    if (Object.hasOwn(passi, evento.key)) {
      evento.preventDefault();
      interazione();
      basi = ruota(basi, ...passi[evento.key]);
      aggiorna();
    } else if (evento.key === "+" || evento.key === "-") {
      evento.preventDefault();
      cambiaZoom(evento.key === "+" ? 0.85 : 1.18);
    } else if (evento.key === "Enter") {
      evento.preventDefault();
      interazione();
      scegli(0.5, 0.5);
    } else if (evento.key === "Escape" && selezionato) {
      riprendi.click();
    }
  });

  function avviaMotore() {
    try {
      motore = creaMotore(canvas, scena, dati, ritratto);
      aggiorna();
    } catch {
      errore();
    }
  }

  canvas.addEventListener("webglcontextlost", evento => {
    evento.preventDefault();
    motore = undefined;
    puntatori.clear();
    interazione();
    aggiorna();
    errore();
  });
  canvas.addEventListener("webglcontextrestored", () => {
    canvas.hidden = false;
    canvas.style.display = "block";
    comandi.hidden = false;
    stato.textContent = "";
    selezionato = undefined;
    riprendi.disabled = true;
    avviaMotore();
  });
  new MutationObserver(aggiorna).observe(tana, { attributes: true, attributeFilter: ["hidden"] });
  new ResizeObserver(aggiorna).observe(canvas);
  document.addEventListener("visibilitychange", aggiorna);
  movimento.addEventListener("change", evento => {
    if (evento.matches) automatico = false;
    aggiornaPulsante();
    aggiorna();
  });
  avviaMotore();
}
