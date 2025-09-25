// ===== Simple drag-to-house mini-game with STRESS METER + BG SHIFT =====

// DOM refs
const spawnLane   = document.getElementById('spawnLane');
const housesGrid  = document.getElementById('houses');
const housesLeftEl= document.getElementById('housesLeft');
const waitingEl   = document.getElementById('waiting');
const timeEl      = document.getElementById('time');
const overlay     = document.getElementById('overlay');
const restartBtn  = document.getElementById('restartBtn');

// Stress meter refs (added in HTML)
const stressBar   = document.getElementById('stressBar');
const stressLabel = document.getElementById('stressLabel');

// Game state
let houses = [];
let people = [];
let housesLeft = 12;
let waiting = 0;
let running = true;
let t = 0;                 // seconds
let spawnMs = 1300;        // interval between spawns; ramps faster
let spawnTimer = 0;

// Stress state
let stress = 0;
const STRESS_MAX = 100;

// Loop timing (must exist before init uses it)
let last = 0;

// Utilities
function clamp(v, lo, hi){ return Math.max(lo, Math.min(hi, v)); }
function gameRect(){ return document.getElementById('game').getBoundingClientRect(); }
function pointer(e){
  if (e.touches && e.touches[0]) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
  return { x: e.clientX, y: e.clientY };
}

// Emojis for people
const EMOJIS = [
  '👩','👨','🧑','👩‍🦱','👨‍🦱',
  '👩‍👧','👨‍👧','👨‍👦','👩‍👦',
  '👨‍👩‍👧','👩‍👩‍👧','👨‍👨‍👧'
];

// ------------------ INIT ------------------
function init() {
  // Build / reset houses
  housesGrid.innerHTML = '';
  houses = [];
  for (let i = 0; i < housesLeft; i++) {
    const el = document.createElement('div');
    el.className = 'house';
    el.dataset.filled = '0';

    // progress slot
    const slot = document.createElement('div');
    slot.className = 'slot';
    const bar = document.createElement('div');
    bar.className = 'bar';
    slot.appendChild(bar);
    el.appendChild(slot);

    housesGrid.appendChild(el);
    houses.push({ el, filled:false, bar });
  }

  // Reset stats/state
  people = [];
  spawnLane.innerHTML = '';
  waiting = 0;
  t = 0;
  spawnMs = 1300;
  spawnTimer = 0;
  running = true;

  // Reset stress + hue
  stress = 0;
  updateStressUI();
  document.documentElement.style.setProperty('--stress-hue', 210);

  // Hide overlay
  overlay.classList.add('hidden');

  // Sync HUD
  syncHUD();

  // Start loop
  last = performance.now();
  requestAnimationFrame(loop);
}

restartBtn.addEventListener('click', init);

// ------------------ LOOP ------------------
function loop(ts){
  const dt = Math.min(0.033, (ts - last)/1000 || 0);
  last = ts;

  if (running) {
    // Timer
    t += dt;

    // Spawner
    spawnTimer += dt*1000;
    if (spawnTimer >= spawnMs) {
      spawnTimer = 0;
      spawnPerson();
      // Ramp up difficulty (faster spawns down to 500ms)
      spawnMs = Math.max(500, spawnMs - 20);
    }

    // ----- STRESS MODEL -----
    // Stress increases with number of waiting households; slowly decays
    const stressGain  = waiting * dt * 0.5;  // increase multiplier
    const stressDecay = dt * 1.5;          // natural calming
    stress = clamp(stress + stressGain - stressDecay, 0, STRESS_MAX);
    updateStressUI();

    // Crisis condition when stress maxes out
    if (stress >= STRESS_MAX) {
      running = false;
      const titleEl = overlay.querySelector('.card h2');
      const textEl  = overlay.querySelector('.card p');
      if (titleEl) titleEl.textContent = 'Crisis Point Reached';
      if (textEl)  textEl.textContent  = 'Too many households waited too long while supply lagged. This is what an affordability crisis feels like.';
      overlay.classList.remove('hidden');
    }
  }

  // HUD clock
  timeEl.textContent = `${Math.floor(t)}s`;

  requestAnimationFrame(loop);
}

// ------------------ HUD + STRESS UI ------------------
function syncHUD(){
  const remaining = housesLeft - houses.filter(h=>h.filled).length;
  housesLeftEl.textContent = remaining;
  waitingEl.textContent = waiting;
}

function updateStressUI() {
  const pct = (stress / STRESS_MAX) * 100;
  // meter fill
  if (stressBar)   stressBar.style.width = `${pct}%`;
  if (stressLabel) stressLabel.textContent = `Stress: ${Math.round(pct)}%`;
  // hue shift: 210 (blue) → 0 (red)
  const hue = 210 - Math.round(pct * 2.10);
  document.documentElement.style.setProperty('--stress-hue', hue);
}

// ------------------ SPAWN + DRAG ------------------
function spawnPerson(){
  const el = document.createElement('div');
  el.className = Math.random() < 0.3 ? 'person small' : 'person';
  el.style.left = `${8 + Math.random()*60}px`;
  el.style.top  = `${20 + Math.random()*(spawnLane.clientHeight-60)}px`;
  el.innerHTML = `<span class="emoji">${EMOJIS[(Math.random()*EMOJIS.length)|0]}</span>`;
  spawnLane.appendChild(el);
  people.push(el);
  waiting++;
  syncHUD();
  makeDraggable(el);
}

function makeDraggable(node){
  let startX=0, startY=0, ox=0, oy=0, dragging=false;

  const down = (e)=>{
    if (!running) return;
    dragging = true;
    node.style.transition = 'none';
    const p = pointer(e);
    startX = p.x; startY = p.y;
    const rect = node.getBoundingClientRect();
    ox = startX - rect.left; oy = startY - rect.top;
    node.style.zIndex = 999;
    e.preventDefault();
  };
  const move = (e)=>{
    if (!dragging) return;
    const p = pointer(e);
    const g = gameRect();
    node.style.left = `${p.x - ox - g.left}px`;
    node.style.top  = `${p.y - oy - g.top }px`;
  };
  const up = ()=>{
    if (!dragging) return;
    dragging = false;
    node.style.zIndex = 1;
    tryPlaceInHouse(node);
  };

  node.addEventListener('mousedown', down);
  window.addEventListener('mousemove', move);
  window.addEventListener('mouseup', up);

  node.addEventListener('touchstart', down, {passive:false});
  window.addEventListener('touchmove', move, {passive:false});
  window.addEventListener('touchend', up);
}

// ------------------ DROP LOGIC ------------------
function tryPlaceInHouse(person){
  const pRect = person.getBoundingClientRect();

  for (const h of houses){
    if (h.filled) continue;
    const r = h.el.getBoundingClientRect();
    const hit = !(pRect.right < r.left || pRect.left > r.right ||
                  pRect.bottom < r.top || pRect.top > r.bottom);
    if (hit){
      // fill house
      h.filled = true;
      h.el.classList.add('filled');
      h.bar.style.width = '100%';

      // remove person
      person.remove();
      people = people.filter(x => x !== person);

      waiting--;
      syncHUD();

      // Housing someone relieves stress
      stress = clamp(stress - 8, 0, STRESS_MAX);
      updateStressUI();

      // Win state if no houses left
      checkEnd();
      return;
    }
  }

  // Not placed → give feedback nudge
  person.style.transition = 'transform .25s ease';
  person.style.transform = 'translateX(-20px)';
  setTimeout(()=> { person.style.transform = ''; }, 250);
}

function checkEnd(){
  const remaining = housesLeft - houses.filter(h=>h.filled).length;
  if (remaining <= 0){
    running = false;
    // show success overlay
    const titleEl = overlay.querySelector('.card h2');
    const textEl  = overlay.querySelector('.card p');
    if (titleEl) titleEl.textContent = 'Housing Supply Exhausted';
    if (textEl)  textEl.textContent  = 'Demand kept rising, but the number of homes didn’t. This is what an affordability crisis feels like.';
    setTimeout(()=> overlay.classList.remove('hidden'), 300);
  }
}

// ------------------ START ------------------
init();
