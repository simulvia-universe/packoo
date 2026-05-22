// ============================================================
// PACKOO — GAME.JS
// Toute la logique du jeu : état, sauvegarde, tap, NFT, etc.
// ============================================================

// ===== ÉTAT DU JEU =====
let state = {
  bones: 0,
  diamonds: 0,
  totalTaps: 0,
  playerLevel: 1,
  playerXP: 0,
  streak: 1,
  lastLoginDate: new Date().toDateString(),
  chanceScore: 0,
  pityCounters: { COMMON:0, UNCOMMON:0, RARE:0, EPIC:0, LEGENDARY:0 },
  boostActive: false,
  boostEnd: 0,
  // État des chiens : id → { unlocked, active, level, xp }
  dogs: {},
};

let currentScreen = 'home';
let dropLocked = false;
let dogFilter = 'all';

// ===== INIT CHIENS =====
// Appelé au démarrage pour initialiser l'état des chiens depuis ALL_DOGS
function initDogs() {
  ALL_DOGS.forEach(dog => {
    if (!state.dogs[dog.id]) {
      state.dogs[dog.id] = {
        unlocked: dog.unlockCost === 0, // Paco débloqué par défaut
        active:   dog.unlockCost === 0,
        level:    1,
        xp:       0,
      };
    }
  });
}

// ===== SAUVEGARDE =====
function saveState() {
  try {
    localStorage.setItem('packoo_v1', JSON.stringify(state));
  } catch(e) {}
}

function loadState() {
  try {
    const raw = localStorage.getItem('packoo_v1');
    if (!raw) return;
    const saved = JSON.parse(raw);
    Object.assign(state, saved);
    checkStreak();
  } catch(e) {}
}

function checkStreak() {
  const today     = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  if (state.lastLoginDate === today) return;
  if (state.lastLoginDate === yesterday) {
    state.streak++;
    showToast('🔥 Streak ' + state.streak + ' jours ! Bonus activé !');
  } else {
    state.streak = 1;
  }
  state.lastLoginDate = today;
}

// ===== CALCULS =====
function getProduction(rarity, level) {
  return Math.round(RARITY[rarity].baseProduction * Math.pow(1.08, level - 1));
}

function getLevelCost(rarity, level) {
  if (level >= MAX_LEVEL) return null;
  return LEVEL_COSTS[rarity][level - 1];
}

function getTotalProduction() {
  let total = 0;
  ALL_DOGS.forEach(dog => {
    const d = state.dogs[dog.id];
    if (d && d.unlocked && d.active) {
      total += getProduction(dog.rarity, d.level);
    }
  });
  return total;
}

function getTapBones() {
  const days = state.totalTaps / 500;
  if (days < 15) return 15;
  if (days < 30) return 50;
  if (days < 45) return 150;
  if (days < 60) return 300;
  return 500;
}

function getStreakMult() {
  if (state.streak >= 30) return 2.0;
  if (state.streak >= 14) return 1.5;
  if (state.streak >= 7)  return 1.25;
  if (state.streak >= 3)  return 1.1;
  return 1.0;
}

// ===== FORMAT =====
function fmt(n) {
  n = Math.floor(n);
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return n.toLocaleString('fr-FR');
}

// ===== TAP PACO =====
function tapPaco(e) {
  if (currentScreen !== 'home') return;
  const base   = getTapBones();
  const streak = getStreakMult();
  const boost  = (state.boostActive && Date.now() < state.boostEnd) ? 2 : 1;
  const gain   = Math.round((base + Math.floor(Math.random() * 6)) * streak * boost);

  state.bones      += gain;
  state.totalTaps  ++;
  state.chanceScore++;
  state.playerXP   += 2;
  Object.keys(state.pityCounters).forEach(r => state.pityCounters[r]++);

  // Montée de niveau joueur
  const xpMax = state.playerLevel * 100;
  if (state.playerXP >= xpMax) {
    state.playerXP  -= xpMax;
    state.playerLevel++;
    showToast('🎉 Niveau ' + state.playerLevel + ' atteint !');
  }

  // Animation float
  const float = document.createElement('div');
  float.className = 'bone-float';
  float.textContent = '+' + gain + ' 🦴';
  const cx = e && e.clientX ? e.clientX : window.innerWidth / 2;
  const cy = e && e.clientY ? e.clientY : window.innerHeight / 2;
  float.style.cssText = 'left:' + (cx - 20) + 'px;top:' + (cy - 20) + 'px';
  document.body.appendChild(float);
  setTimeout(() => float.remove(), 900);

  // Bounce Paco
  const p = document.querySelector('.paco-img');
  if (p) { p.style.transform = 'scale(0.88)'; setTimeout(() => p.style.transform = '', 110); }

  updateUI();
  checkNFTDrop();
  if (state.totalTaps % 50 === 0) saveState();
}

// ===== PRODUCTION PASSIVE =====
setInterval(() => {
  const prod = getTotalProduction();
  if (prod > 0) {
    state.bones += (prod * getStreakMult()) / 3600;
    updateUI();
  }
}, 1000);

setInterval(saveState, 30000);

// ===== DROP NFT =====
function checkNFTDrop() {
  if (dropLocked) return;
  const mult = 1 + state.chanceScore / 8000;
  for (const nft of NFT_POOL) {
    const pityReady = state.pityCounters[nft.pityKey] >= PITY_LIMITS[nft.pityKey];
    if (pityReady || Math.random() < nft.chance * mult) {
      state.pityCounters[nft.pityKey] = 0;
      dropLocked = true;
      triggerNFT(nft);
      setTimeout(() => { dropLocked = false; }, 5000);
      break;
    }
  }
}

function triggerNFT(nft) {
  document.getElementById('nftName').textContent   = nft.name;
  document.getElementById('nftRarity').textContent = nft.rarity;
  const c = document.getElementById('sparklesCont');
  c.innerHTML = '';
  for (let i = 0; i < 40; i++) {
    const s = document.createElement('div');
    s.className = 'sparkle';
    s.style.cssText =
      'left:'   + Math.random() * 100 + '%;' +
      'top:'    + Math.random() * 100 + '%;' +
      '--tx:'   + ((Math.random() - .5) * 250) + 'px;' +
      '--ty:'   + ((Math.random() - .5) * 250) + 'px;' +
      'animation-delay:' + Math.random() * 0.6 + 's';
    c.appendChild(s);
  }
  document.getElementById('nftOverlay').classList.add('show');
  saveState();
}

function closeNFT() {
  document.getElementById('nftOverlay').classList.remove('show');
  state.chanceScore = Math.max(0, state.chanceScore - 600);
}

// ===== CHIENS — ACTIONS =====
function unlockDog(dogId) {
  const dog = ALL_DOGS.find(d => d.id === dogId);
  if (!dog || dog.unlockCost === null) return;
  const d = state.dogs[dogId];
  if (d.unlocked) return;
  if (state.bones < dog.unlockCost) {
    showToast('🦴 Il te faut ' + fmt(dog.unlockCost) + ' Bones !');
    return;
  }
  state.bones     -= dog.unlockCost;
  d.unlocked       = true;
  const activeCount = Object.values(state.dogs).filter(x => x.active).length;
  if (activeCount < MAX_ACTIVE) d.active = true;
  state.pityCounters.UNCOMMON += 20;
  state.pityCounters.RARE     += 10;
  updateUI();
  renderDogsScreen();
  showToast('🎉 ' + dog.emoji + ' ' + dog.name + ' débloqué !');
  saveState();
}

function upgradeDog(dogId) {
  const dog = ALL_DOGS.find(d => d.id === dogId);
  if (!dog) return;
  const d = state.dogs[dogId];
  if (!d.unlocked || d.level >= MAX_LEVEL) return;
  const cost = getLevelCost(dog.rarity, d.level);
  if (!cost) return;
  if (state.bones < cost) {
    showToast('🦴 Il te faut ' + fmt(cost) + ' Bones !');
    return;
  }
  state.bones -= cost;
  d.level++;
  d.xp = Math.min(d.xp + 10, d.level * 10);
  updateUI();
  renderDogsScreen();
  if (d.level % 10 === 0) showToast('🔥 ' + dog.name + ' niveau ' + d.level + ' !');
  saveState();
}

function upgradeAll() {
  let count = 0;
  ALL_DOGS.forEach(dog => {
    const d = state.dogs[dog.id];
    if (!d || !d.unlocked || d.level >= MAX_LEVEL) return;
    const cost = getLevelCost(dog.rarity, d.level);
    if (cost && state.bones >= cost) {
      state.bones -= cost;
      d.level++;
      count++;
    }
  });
  if (count === 0) { showToast('Pas assez de Bones !'); return; }
  updateUI();
  renderDogsScreen();
  showToast('⬆️ ' + count + ' chien' + (count > 1 ? 's améliorés' : ' amélioré') + ' !');
  saveState();
}

function toggleActive(dogId) {
  const dog = ALL_DOGS.find(d => d.id === dogId);
  if (!dog) return;
  const d = state.dogs[dogId];
  if (!d || !d.unlocked) return;
  if (d.active) {
    if (dogId === 'paco') { showToast('Paco ne peut pas être désactivé !'); return; }
    d.active = false;
  } else {
    const activeCount = Object.values(state.dogs).filter(x => x.active).length;
    if (activeCount >= MAX_ACTIVE) { showToast('Équipe pleine ! (' + MAX_ACTIVE + ' max)'); return; }
    d.active = true;
  }
  updateUI();
  renderDogsScreen();
  saveState();
}

function setDogFilter(filter) {
  dogFilter = filter;
  document.querySelectorAll('#screen-chiens .tab').forEach((t, i) => {
    t.classList.toggle('active', ['all','active','nft','rarity'][i] === filter);
  });
  renderDogsScreen();
}

// ===== SHOP =====
function buyChest(type) {
  const costs = {
    COMMON:    { bones:2000,  diamonds:0   },
    RARE:      { bones:0,     diamonds:200 },
    LEGENDARY: { bones:0,     diamonds:500 },
  };
  const c = costs[type];
  if (c.bones    > 0 && state.bones    < c.bones)    { showToast('Pas assez de Bones ! 🦴');    return; }
  if (c.diamonds > 0 && state.diamonds < c.diamonds) { showToast('Pas assez de Diamants ! 💎'); return; }
  state.bones    -= c.bones;
  state.diamonds -= c.diamonds;

  const bonusMap = { COMMON:1000, UNCOMMON:3000, RARE:8000, EPIC:25000, LEGENDARY:80000 };
  const chances  = {
    COMMON:    { COMMON:0.6, UNCOMMON:0.3, RARE:0.1 },
    RARE:      { UNCOMMON:0.3, RARE:0.5, EPIC:0.2   },
    LEGENDARY: { RARE:0.2, EPIC:0.5, LEGENDARY:0.3  },
  };
  let r = Math.random(), cumul = 0, won = 'COMMON';
  for (const [rarity, prob] of Object.entries(chances[type])) {
    cumul += prob;
    if (r < cumul) { won = rarity; break; }
  }
  state.bones += bonusMap[won];
  updateUI();
  saveState();
  showToast('🎲 ' + RARITY[won].label + ' — 🦴 +' + fmt(bonusMap[won]) + ' !');
}

function buyBoost(type) {
  const costs = { production:150, chance:200 };
  if (state.diamonds < costs[type]) { showToast('Pas assez de Diamants ! 💎'); return; }
  state.diamonds -= costs[type];
  state.boostActive = true;
  state.boostEnd    = Date.now() + (type === 'production' ? 7200000 : 3600000);
  if (type === 'chance') Object.keys(state.pityCounters).forEach(r => state.pityCounters[r] += 50);
  updateUI();
  saveState();
  showToast(type === 'production' ? '⚡ Boost x2 activé 2h !' : '🍀 Chance NFT x3 activé 1h !');
}

// ===== UPDATE UI =====
function updateUI() {
  // Bones
  const elB = document.getElementById('bonesDisplay');
  if (elB) elB.textContent = fmt(state.bones);

  // Diamants
  const elD = document.getElementById('diamondsDisplay');
  if (elD) elD.textContent = state.diamonds.toLocaleString('fr-FR');

  // Production
  const prod = getTotalProduction();
  const effProd = Math.round(prod * getStreakMult());
  const elProd = document.getElementById('prodDisplay');
  if (elProd) elProd.textContent = fmt(effProd);
  const elTopProd = document.getElementById('topbarProd');
  if (elTopProd) elTopProd.textContent = '+' + fmt(effProd) + '/h';

  // Niveau joueur
  const xpMax = state.playerLevel * 100;
  const pct   = Math.round((state.playerXP / xpMax) * 100);
  const elLvl = document.getElementById('playerLevel');
  if (elLvl) elLvl.textContent = state.playerLevel;
  const elBar = document.getElementById('playerLvlBar');
  if (elBar) elBar.style.width = pct + '%';
  const elPct = document.getElementById('playerLvlPct');
  if (elPct) elPct.textContent = pct + '%';
  const elLvlTag = document.getElementById('levelTag');
  if (elLvlTag) elLvlTag.textContent = 'NIVEAU ' + state.playerLevel;
  const elLvlBar2 = document.getElementById('levelBarInner');
  if (elLvlBar2) elLvlBar2.style.width = pct + '%';
  const elLvlTxt = document.getElementById('levelBarTxt');
  if (elLvlTxt) elLvlTxt.textContent = state.playerXP + ' / ' + xpMax;

  // Shop
  const elSB = document.getElementById('shopBones');
  if (elSB) elSB.textContent = fmt(state.bones);
  const elSD = document.getElementById('shopDiamonds');
  if (elSD) elSD.textContent = state.diamonds.toLocaleString('fr-FR');

  // Chiens actifs
  const activeCount = Object.values(state.dogs).filter(x => x.active).length;
  const elAct = document.getElementById('dogActiveCount');
  if (elAct) elAct.textContent = activeCount + '/' + MAX_ACTIVE;
  const elDProd = document.getElementById('dogProdTotal');
  if (elDProd) elDProd.textContent = fmt(effProd) + ' /h';
}

// ===== RENDERS =====
function renderDogsScreen() {
  const container = document.getElementById('dogCardsContainer');
  if (!container) return;

  let dogs = ALL_DOGS.filter(dog => state.dogs[dog.id] && state.dogs[dog.id].unlocked);
  if (dogFilter === 'active')  dogs = dogs.filter(dog => state.dogs[dog.id].active);
  if (dogFilter === 'nft')     dogs = dogs.filter(dog => dog.rarity === 'LEGENDARY');
  if (dogFilter === 'rarity') {
    const order = ['LEGENDARY','EPIC','RARE','UNCOMMON','COMMON'];
    dogs = [...dogs].sort((a,b) => order.indexOf(a.rarity) - order.indexOf(b.rarity));
  }

  const locked = ALL_DOGS.filter(dog => {
    const d = state.dogs[dog.id];
    return d && !d.unlocked && dog.unlockCost !== null;
  });

  let html = '';

  dogs.forEach(dog => {
    const d    = state.dogs[dog.id];
    const r    = RARITY[dog.rarity];
    const prod = getProduction(dog.rarity, d.level);
    const cost = getLevelCost(dog.rarity, d.level);
    const xpPct = Math.min(100, Math.round((d.xp / (d.level * 10)) * 100));
    const activeTxt = d.active
      ? '<div class="actif-badge"><div class="actif-dot"></div>ACTIF</div>'
      : '<div class="actif-badge reserve"><div class="actif-dot grey"></div>RÉSERVE</div>';

    html += `
    <div class="dog-card">
      <div class="dog-card-img">
        <div class="rarity-badge" style="background:${r.color}">${r.label}</div>
        <div class="niv-badge">Niv. ${d.level}</div>
        <span class="dog-emoji">${dog.emoji}</span>
      </div>
      <div class="dog-card-info">
        <div class="dog-card-header">
          <div class="dog-card-name">${dog.name}${dog.id === 'paco' ? ' ⭐' : ''}</div>
          <div onclick="toggleActive('${dog.id}')" style="cursor:pointer">${activeTxt}</div>
        </div>
        <div class="prod-label">Production</div>
        <div class="prod-val">🦴 +${fmt(prod)} /h</div>
        <div class="xp-bar-wrap">
          <div class="xp-bar-outer"><div class="xp-bar-inner" style="width:${xpPct}%"></div></div>
          <div class="xp-txt">Niv. ${d.level} / ${MAX_LEVEL}</div>
        </div>
        <div class="dog-card-btns">
          ${cost
            ? `<button class="btn-ameliorer" onclick="upgradeDog('${dog.id}')">⬆️ ${fmt(cost)} 🦴</button>`
            : `<button class="btn-ameliorer disabled">NIVEAU MAX</button>`}
          <button class="btn-details">Détails</button>
        </div>
      </div>
    </div>`;
  });

  // Chiens verrouillés (les 5 prochains à débloquer)
  locked.slice(0, 5).forEach(dog => {
    const r          = RARITY[dog.rarity];
    const canAfford  = state.bones >= dog.unlockCost;
    html += `
    <div class="dog-card locked-card">
      <div class="dog-card-img locked-img">
        <span class="dog-emoji" style="opacity:0.5">${dog.emoji}</span>
      </div>
      <div class="dog-card-info">
        <div class="rarity-badge inline" style="background:${r.color}">${r.label}</div>
        <div class="dog-card-name">${dog.name}</div>
        <div class="prod-label">Production de base</div>
        <div class="prod-val">🦴 +${fmt(RARITY[dog.rarity].baseProduction)} /h</div>
        <button onclick="unlockDog('${dog.id}')"
          class="btn-ameliorer${canAfford ? '' : ' disabled'}">
          ${canAfford ? '🔓 ' : '🔒 '}${fmt(dog.unlockCost)} 🦴
        </button>
      </div>
    </div>`;
  });

  container.innerHTML = html;
}

function renderCollection() {
  const unlocked = ALL_DOGS.filter(dog => state.dogs[dog.id] && state.dogs[dog.id].unlocked);
  const el = document.getElementById('collDiscovered');
  if (el) el.textContent = unlocked.length + ' / ' + ALL_DOGS.length;

  const grid = document.getElementById('collGrid');
  if (!grid) return;
  let html = '';
  ALL_DOGS.forEach(dog => {
    const d = state.dogs[dog.id];
    const r = RARITY[dog.rarity];
    if (d && d.unlocked) {
      const prod = getProduction(dog.rarity, d.level);
      html += `<div class="coll-card" style="border-color:${r.color}">
        <span style="font-size:36px">${dog.emoji}</span>
        <div class="coll-rarity" style="color:${r.color}">${r.label}</div>
        <div class="coll-name">${dog.name}</div>
        <div class="coll-prod">+${fmt(prod)}/h</div>
        <div class="coll-lvl">Niv.${d.level}</div>
      </div>`;
    } else if (dog.unlockCost === null) {
      html += `<div class="coll-card secret">
        <span style="font-size:30px">🌑</span>
        <div class="coll-rarity" style="color:#E67E22">Drop uniquement</div>
        <div class="coll-name">???</div>
      </div>`;
    } else {
      html += `<div class="coll-card locked"><span style="font-size:30px">🔒</span><div class="coll-name">???</div></div>`;
    }
  });
  grid.innerHTML = html;
}

function renderQuests() {
  const container = document.getElementById('questsDailyContent');
  if (!container) return;
  const tap50done  = state.totalTaps >= 50;
  const tap200done = state.totalTaps >= 200;
  container.innerHTML = `
    ${questCard('🐾', 'Taper 50 fois',    'Tape sur Paco 50 fois.',      Math.min(state.totalTaps,50),  50,  '🦴 2,000', tap50done,  'tap50')}
    ${questCard('🏆', 'Taper 200 fois',   'Deviens un vrai DogMaster !', Math.min(state.totalTaps,200), 200, '💎 15',    tap200done, 'tap200')}
    ${questCard('📅', 'Connexion du jour', 'Tu es connecté !',            1, 1, '🦴 1,000', false, 'login')}
  `;
}

function questCard(icon, title, desc, prog, max, reward, done, key) {
  const pct = Math.round((prog / max) * 100);
  const complete = prog >= max;
  let btn = '';
  if (done) {
    btn = '<span style="font-size:22px">✅</span>';
  } else if (complete) {
    btn = `<button onclick="collectQuest('${key}')" class="btn-ameliorer">RÉCLAMER !</button>`;
  } else {
    btn = `<button class="btn-ameliorer disabled">EN COURS</button>`;
  }
  return `
  <div class="quest-card">
    <div class="quest-icon">${icon}</div>
    <div class="quest-info">
      <div class="quest-title">${title}</div>
      <div class="quest-desc">${desc}</div>
      <div class="quest-bar-outer"><div class="quest-bar-inner" style="width:${pct}%"></div></div>
      <div class="quest-prog">${prog} / ${max}</div>
    </div>
    <div class="quest-reward">
      <div class="quest-reward-label">RÉCOMPENSE</div>
      <div class="quest-reward-val">${reward}</div>
      <div style="margin-top:4px">${btn}</div>
    </div>
  </div>`;
}

function collectQuest(key) {
  const rewards = {
    tap50:  { bones:2000,  diamonds:0  },
    tap200: { bones:0,     diamonds:15 },
    login:  { bones:1000,  diamonds:0  },
  };
  const r = rewards[key];
  if (!r) return;
  state.bones    += r.bones;
  state.diamonds += r.diamonds;
  updateUI();
  renderQuests();
  let msg = [];
  if (r.bones    > 0) msg.push('🦴 +' + fmt(r.bones));
  if (r.diamonds > 0) msg.push('💎 +' + r.diamonds);
  showToast(msg.join(' ') + ' réclamés !');
  saveState();
}

// ===== NAVIGATION =====
function navigate(screen) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active','slide-in'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('screen-' + screen).classList.add('active', 'slide-in');
  const nav = document.getElementById('nav-' + screen);
  if (nav) nav.classList.add('active');
  currentScreen = screen;
  const isHome = screen === 'home';
  document.getElementById('bgHome').classList.toggle('dimmed', !isHome);
  document.getElementById('bgDark').classList.toggle('active', !isHome);
  document.getElementById('topbar').className = 'topbar ' + (isHome ? 'home-bar' : 'dark-bar');
  closeDogsPanel();
  // Render à l'ouverture de l'écran
  if (screen === 'chiens')     renderDogsScreen();
  if (screen === 'collection') renderCollection();
  if (screen === 'quetes')     renderQuests();
  updateUI();
}

function switchQueteTab(tab) {
  ['daily','weekly','defis'].forEach(t => {
    const el = document.getElementById('quetes-' + t);
    if (el) el.style.display = t === tab ? 'block' : 'none';
    const btn = document.getElementById('qtab-' + t);
    if (btn) btn.classList.toggle('active', t === tab);
  });
  const sub = document.getElementById('quetesSubtitle');
  if (sub) sub.textContent = {daily:'QUOTIDIENNES', weekly:'HEBDOMADAIRES', defis:'DÉFIS'}[tab];
  if (tab === 'daily') renderQuests();
}

function openDogsPanel() {
  document.getElementById('dogsPanel').classList.add('open');
  document.getElementById('panelBackdrop').classList.add('open');
}
function closeDogsPanel() {
  document.getElementById('dogsPanel').classList.remove('open');
  document.getElementById('panelBackdrop').classList.remove('open');
}

// ===== TOAST =====
function showToast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2500);
}

// ===== DÉMARRAGE =====
loadState();
initDogs();
updateUI();
renderDogsScreen();
