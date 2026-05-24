// ============================================================
// PACKOO — GAME.JS
// Toute la logique du jeu
// ============================================================

// ===== ÉTAT =====
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
  wonNFTs: [], // NFT gagnés : { name, rarity, collection, date }
  passPoints: 0,
  passLevel: 1,
  passActivated: false,
  questsDaily: {
    tap50:  { progress:0, done:false },
    tap200: { progress:0, done:false },
    unlock: { done:false, claimed:false },
    login:  { done:true,  claimed:false },
  },
  questsWeekly: {
    tap1000: { progress:0, done:false },
    tap5000: { progress:0, done:false },
    unlock3: { progress:0, done:false },
  },
  lastWeeklyReset: '',
  defis: {
    reach10: { done:false }, // atteindre niveau 10
    unlock5: { done:false }, // débloquer 5 chiens
    earn100k: { done:false }, // gagner 100k bones total
  },
  totalBonesEarned: 0,
};

let currentScreen = 'home';
let dropLocked    = false;
let dogFilter     = 'all';

// ===== SAUVEGARDE =====
function saveState() {
  try {
    const save = Object.assign({}, state, {
      bones: Math.floor(state.bones),
      dogs: ALL_DOGS.map(d => ({ id:d.id, unlocked:d.unlocked, active:d.active, level:d.level, xp:d.xp })),
      lastOnline: Date.now()
    });
    localStorage.setItem('packoo_save', JSON.stringify(save));
  } catch(e) {}
}

function loadState() {
  try {
    const raw = localStorage.getItem('packoo_save');
    if (!raw) return;
    const s = JSON.parse(raw);
    Object.assign(state, s);
    // Restaurer les chiens
    if (s.dogs) {
      s.dogs.forEach(sd => {
        const dog = ALL_DOGS.find(d => d.id === sd.id);
        if (dog) Object.assign(dog, { unlocked:sd.unlocked, active:sd.active, level:sd.level, xp:sd.xp });
      });
    }
    // Offline earnings
    if (s.lastOnline) {
      const secondsOffline = Math.floor((Date.now() - s.lastOnline) / 1000);
      const maxOffline = 8 * 3600; // max 8h de gains offline
      const effectiveSeconds = Math.min(secondsOffline, maxOffline);
      if (effectiveSeconds > 60) {
        const prod = ALL_DOGS
          .filter(d => d.unlocked && d.active)
          .reduce((sum, d) => sum + getProduction(d.rarity, d.level, d.id), 0);
        const earned = Math.floor(prod * effectiveSeconds / 3600);
        if (earned > 0) {
          state.bones += earned;
          state._offlineEarned = earned;
          state._offlineSeconds = effectiveSeconds;
        }
      }
    }

    // Streak
    const today     = new Date().toDateString();
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    if (state.lastLoginDate !== today) {
      state.streak = (state.lastLoginDate === yesterday) ? state.streak + 1 : 1;
      state.lastLoginDate = today;
      // Reset quêtes quotidiennes
      state.questsDaily = { tap50:{progress:0,done:false,claimed:false}, tap200:{progress:0,done:false,claimed:false}, unlock:{done:false,claimed:false}, login:{done:true,claimed:false} };
    }
  } catch(e) {}
}

// ===== FORMULES =====
function getProduction(rarity, level, dogId) {
  // Si DOG_PRODUCTION existe (nouveau data.js), on utilise la valeur niveau 50 comme base
  if (dogId && typeof DOG_PRODUCTION !== 'undefined' && DOG_PRODUCTION[dogId]) {
    const maxProd = DOG_PRODUCTION[dogId];
    return Math.round(maxProd * Math.pow(1.0 / Math.pow(1.08, 49), 1) * Math.pow(1.08, level - 1));
  }
  return Math.round(RARITY[rarity].baseProduction * Math.pow(1.08, level - 1));
}
function getLevelCost(rarity, level, dogId) {
  if (level >= MAX_LEVEL) return null;
  // Nouveau data.js : LEVEL_COSTS indexé par id chien (en majuscules)
  const key = dogId ? dogId.toUpperCase() : rarity;
  const arr = LEVEL_COSTS[key] || LEVEL_COSTS[rarity];
  if (!arr) return null;
  return arr[level - 1];
}
function getTotalProduction() {
  return ALL_DOGS
    .filter(d => d.unlocked && d.active)
    .reduce((sum, d) => sum + getProduction(d.rarity, d.level, d.id), 0);
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
function fmt(n) {
  n = Math.floor(n);
  if (n >= 1e6) return (n/1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n/1e3).toFixed(1) + 'K';
  return n.toLocaleString('fr-FR');
}

// ===== MISE À JOUR UI =====
function updateUI() {
  // Bones + production
  const el = document.getElementById('bonesDisplay');
  if (el) el.textContent = fmt(state.bones);
  const prod = Math.round(getTotalProduction() * getStreakMult());
  // Bouton central nav
  const navProd = document.getElementById('navProdDisplay');
  if (navProd) navProd.textContent = fmt(prod) + '/h';
  // Diamants
  const gemVal = document.getElementById('diamondsDisplay');
  if (gemVal) gemVal.textContent = fmt(state.diamonds);
  // Niveau joueur
  const xpMax = state.playerLevel * 100;
  const pct   = Math.round((state.playerXP / xpMax) * 100);
  const lvlTag   = document.getElementById('playerLvlTag');
  const lvlBar   = document.getElementById('playerLvlBar');
  const lvlTxt   = document.getElementById('playerLvlTxt');
  const lvlBadge = document.getElementById('playerLvlBadge');
  if (lvlTag)   lvlTag.textContent   = 'NIVEAU ' + state.playerLevel;
  if (lvlBar)   lvlBar.style.width   = pct + '%';
  if (lvlTxt)   lvlTxt.textContent   = state.playerXP + ' / ' + xpMax;
  if (lvlBadge) lvlBadge.textContent = state.playerLevel;
  // Shop
  const shopB = document.getElementById('shopBones');
  if (shopB) shopB.textContent = fmt(state.bones);
  const shopD = document.getElementById('shopDiamonds');
  if (shopD) shopD.textContent = state.diamonds.toLocaleString('fr-FR');
  // Badge quêtes
  updateQuestBadge();
}

function updateQuestBadge() {
  const q = state.questsDaily;
  let count = 0;
  // Compter quêtes complètes mais pas encore réclamées
  if (q.login  && !q.login.claimed)  count++;
  if (q.tap50  && q.tap50.progress  >= 50  && !q.tap50.claimed)  count++;
  if (q.tap200 && q.tap200.progress >= 200 && !q.tap200.claimed) count++;
  if (q.unlock && q.unlock.done && !q.unlock.claimed) count++;
  const badge = document.getElementById('questBadge');
  if (badge) {
    badge.style.display = count > 0 ? 'flex' : 'none';
    badge.textContent = count;
  }
}

// ===== TOAST =====
function showToast(msg) {
  const t = document.createElement('div');
  t.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:rgba(245,166,35,0.97);color:#1A0F00;font-weight:900;font-size:13px;padding:10px 20px;border-radius:20px;z-index:9999;white-space:nowrap;box-shadow:0 4px 20px rgba(245,166,35,0.4);';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2500);
}

// ===== PRODUCTION PASSIVE =====
setInterval(() => {
  const prod = getTotalProduction() * getStreakMult() * (window.devPassifMult || 1);
  if (prod > 0) { state.bones += prod / 3600; updateUI(); }
}, 1000);
setInterval(saveState, 30000);

// ===== TAP PACO =====
function tapPaco(e) {
  if (currentScreen !== 'home') return;
  const base  = getTapBones();
  const boost = (state.boostActive && Date.now() < state.boostEnd) ? 2 : 1;
  const gain  = Math.round((base + Math.floor(Math.random() * 6)) * getStreakMult() * boost * (window.devTapMult || 1));

  state.bones      += gain;
  state.totalTaps  ++;
  state.chanceScore++;
  state.playerXP   += 2;
  state.passPoints = (state.passPoints || 0) + 1;
  // Montée niveau pass
  if (state.passPoints >= state.passLevel * 100) {
    state.passLevel++;
    showToast('👑 Pass niveau ' + state.passLevel + ' !');
  }
  Object.keys(state.pityCounters).forEach(r => state.pityCounters[r]++);

  // Quêtes tap
  if (!state.questsDaily.tap50.done)   state.questsDaily.tap50.progress  = Math.min(state.questsDaily.tap50.progress  + 1, 50);
  if (!state.questsDaily.tap200.done)  state.questsDaily.tap200.progress = Math.min(state.questsDaily.tap200.progress + 1, 200);
  if (!state.questsWeekly.tap1000.done) state.questsWeekly.tap1000.progress = Math.min(state.questsWeekly.tap1000.progress + 1, 1000);
  if (!state.questsWeekly.tap5000.done) state.questsWeekly.tap5000.progress = Math.min(state.questsWeekly.tap5000.progress + 1, 5000);
  // Défis
  if (!state.defis.reach10.done && state.playerLevel >= 10) state.defis.reach10.done = false; // claimable
  if (!state.defis.earn100k.done) state.totalBonesEarned = (state.totalBonesEarned||0) + gain;

  // Niveau joueur
  const xpMax = state.playerLevel * 100;
  if (state.playerXP >= xpMax) {
    state.playerXP  -= xpMax;
    state.playerLevel++;
    showToast('🎉 Niveau ' + state.playerLevel + ' atteint !');
  }

  // Animation float
  const float = document.createElement('div');
  float.className  = 'bone-float';
  float.textContent = '+' + gain + ' 🦴';
  float.style.cssText = 'left:' + ((e&&e.clientX?e.clientX:window.innerWidth/2)-20) + 'px;top:' + ((e&&e.clientY?e.clientY:window.innerHeight/2)-20) + 'px';
  document.body.appendChild(float);
  setTimeout(() => float.remove(), 900);

  // Bounce Paco
  const p = document.querySelector('.paco-img');
  if (p) {
    p.classList.remove('tapped');
    void p.offsetWidth; // force reflow pour relancer l'animation
    p.classList.add('tapped');
    setTimeout(() => p.classList.remove('tapped'), 400);
  }

  updateUI();
  checkDrop();
  if (state.totalTaps % 50 === 0) saveState();
}

// ===== NFT DROP =====
function checkDrop() {
  if (dropLocked) return;
  const m = 1 + state.chanceScore / 8000;
  const allNFT = [...NFT_POOLS.GENESIS, ...NFT_POOLS.THEMATIC, ...NFT_POOLS.SEASONAL];
  for (const n of allNFT) {
    const pityReady = state.pityCounters[n.pityKey] >= PITY_LIMITS[n.pityKey];
    if (pityReady || Math.random() < n.chance * m) {
      state.pityCounters[n.pityKey] = 0;
      dropLocked = true;
      triggerNFT(n);
      setTimeout(() => { dropLocked = false; }, 5000);
      break;
    }
  }
}
function triggerNFT(nft) {
  // Déterminer la collection
  let collection = 'Saison 1';
  if (NFT_POOLS.GENESIS.find(n => n.name === nft.name)) collection = 'Genesis';
  else if (NFT_POOLS.THEMATIC.find(n => n.name === nft.name)) collection = 'Thématique';

  // Sauvegarder le NFT gagné
  state.wonNFTs.push({
    name: nft.name,
    rarity: nft.rarity,
    collection: collection,
    date: new Date().toLocaleDateString('fr-FR'),
  });

  document.getElementById('nftName').textContent   = nft.name;
  document.getElementById('nftRarity').textContent = nft.rarity;
  const c = document.getElementById('sparklesCont');
  if (c) {
    c.innerHTML = '';
    for (let i = 0; i < 40; i++) {
      const s = document.createElement('div');
      s.className = 'sparkle';
      s.style.cssText = 'left:'+Math.random()*100+'%;top:'+Math.random()*100+'%;--tx:'+((Math.random()-.5)*250)+'px;--ty:'+((Math.random()-.5)*250)+'px;animation-delay:'+Math.random()*0.6+'s';
      c.appendChild(s);
    }
  }
  document.getElementById('nftOverlay').classList.add('show');
  saveState();
}
function closeNFT() {
  document.getElementById('nftOverlay').classList.remove('show');
  state.chanceScore = Math.max(0, state.chanceScore - 600);
}

// ===== CHIENS — DÉBLOQUER / AMÉLIORER =====
function unlockDog(dogId) {
  const dog = ALL_DOGS.find(d => d.id === dogId);
  if (!dog || dog.unlocked || dog.unlockCost === null) return;
  if (state.bones < dog.unlockCost) { showToast('🦴 Il te faut ' + fmt(dog.unlockCost) + ' Bones !'); return; }
  state.bones -= dog.unlockCost;
  dog.unlocked = true;
  const activeCount = ALL_DOGS.filter(d => d.active).length;
  if (activeCount < MAX_ACTIVE) dog.active = true;
  state.questsDaily.unlock.done = true;
  state.pityCounters.UNCOMMON += 20;
  state.pityCounters.RARE     += 10;
  showToast('🎉 ' + dog.emoji + ' ' + dog.name + ' débloqué !');
  updateUI();
  renderDogCards();
  saveState();
}
function upgradeDog(dogId) {
  const dog = ALL_DOGS.find(d => d.id === dogId);
  if (!dog || !dog.unlocked || dog.level >= MAX_LEVEL) return;
  const cost = getLevelCost(dog.rarity, dog.level, dog.id);
  if (!cost) return;
  if (state.bones < cost) { showToast('🦴 Il te faut ' + fmt(cost) + ' Bones !'); return; }
  state.bones -= cost;
  dog.level++;
  dog.xp = Math.min(dog.xp + 10, dog.level * 10);
  if (dog.level % 10 === 0) showToast('🔥 ' + dog.name + ' niveau ' + dog.level + ' !');
  updateUI();
  renderDogCards();
  saveState();
}
function upgradeAll() {
  let n = 0;
  ALL_DOGS.filter(d => d.unlocked && d.level < MAX_LEVEL).forEach(dog => {
    const cost = getLevelCost(dog.rarity, dog.level, dog.id);
    if (cost && state.bones >= cost) { state.bones -= cost; dog.level++; n++; }
  });
  if (n === 0) { showToast('Pas assez de Bones !'); return; }
  showToast('⬆️ ' + n + ' chien' + (n > 1 ? 's améliorés' : ' amélioré') + ' !');
  updateUI(); renderDogCards(); saveState();
}
function toggleActive(dogId) {
  const dog = ALL_DOGS.find(d => d.id === dogId);
  if (!dog || !dog.unlocked) return;
  if (dog.active) {
    if (dog.id === 'paco') { showToast('Paco ne peut pas être désactivé !'); return; }
    dog.active = false;
  } else {
    if (ALL_DOGS.filter(d => d.active).length >= MAX_ACTIVE) { showToast('Équipe pleine !'); return; }
    dog.active = true;
  }
  showToast(dog.emoji + ' ' + dog.name + (dog.active ? ' activé !' : ' en réserve'));
  updateUI(); renderDogCards(); saveState();
}
function setDogFilter(filter) {
  dogFilter = filter;
  document.querySelectorAll('#screen-chiens .filter-tabs .tab').forEach((t, i) => {
    t.classList.toggle('active', ['all','active','nft','rarity'][i] === filter);
  });
  renderDogCards();
}

// ===== RENDU ÉCRAN CHIENS =====
function renderDogCards() {
  const container = document.getElementById('dogCardsContainer');
  if (!container) return;

  let dogs = ALL_DOGS.filter(d => d.unlocked);
  if (dogFilter === 'active')  dogs = dogs.filter(d => d.active);
  if (dogFilter === 'nft')     dogs = dogs.filter(d => d.rarity === 'LEGENDARY');
  // Tri : actifs en premier, puis par production décroissante
  dogs.sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    return getProduction(b.rarity, b.level, b.id) - getProduction(a.rarity, a.level, a.id);
  });
  if (dogFilter === 'rarity')  dogs = [...dogs].sort((a,b) => ['LEGENDARY','EPIC','RARE','UNCOMMON','COMMON'].indexOf(a.rarity) - ['LEGENDARY','EPIC','RARE','UNCOMMON','COMMON'].indexOf(b.rarity));

  const locked = ALL_DOGS.filter(d => !d.unlocked && d.unlockCost !== null);
  let html = '';

  // Chiens débloqués
  dogs.forEach(dog => {
    const r    = RARITY[dog.rarity];
    const prod = getProduction(dog.rarity, dog.level, dog.id);
    const cost = getLevelCost(dog.rarity, dog.level, dog.id);
    const xpPct = Math.min(100, Math.round((dog.xp / (dog.level * 10)) * 100));
    html += `
    <div class="dog-card">
      <div class="dog-card-img">
        <div class="rarity-badge" style="background:${r.color}">${r.label}</div>
        <div class="niv-badge">Niv. ${dog.level}</div>
        <div style="display:flex;align-items:center;justify-content:center;font-size:3em;width:100%;height:100%;">${dog.emoji}</div>
      </div>
      <div class="dog-card-info">
        <div class="dog-card-header">
          <div class="dog-card-name">${dog.name}</div>
          <div class="actif-badge" onclick="toggleActive('${dog.id}')" style="${dog.active?'':'background:rgba(255,255,255,0.05);color:var(--text-muted);'}">
            <div class="actif-dot" style="${dog.active?'':'background:#666;'}"></div>${dog.active?'ACTIF':'RÉSERVE'}
          </div>
        </div>
        <div><div class="prod-label">Production</div><div class="prod-val">🦴 +${fmt(prod)} /h</div></div>
        <div class="xp-bar-wrap"><div class="xp-bar-outer"><div class="xp-bar-inner" style="width:${xpPct}%"></div></div><div class="xp-txt">Niv.${dog.level} / ${MAX_LEVEL}</div></div>
        <div class="dog-card-btns">
          ${cost ? `<button class="btn-ameliorer" onclick="upgradeDog('${dog.id}')">⬆️ ${fmt(cost)} 🦴</button>` : '<button class="btn-ameliorer" style="opacity:0.5;cursor:default;">NIVEAU MAX</button>'}
          <button class="btn-details">Détails</button>
        </div>
      </div>
    </div>`;
  });

  // Chiens verrouillés (si filtre "tous")
  if (dogFilter === 'all') {
    locked.forEach(dog => {
      const r   = RARITY[dog.rarity];
      const can = state.bones >= dog.unlockCost;
      html += `
      <div class="dog-card" style="opacity:${can?1:0.7}">
        <div class="dog-card-img" style="filter:grayscale(${can?0:0.5})">
          <div class="rarity-badge" style="background:${r.color}">${r.label}</div>
          <div style="display:flex;align-items:center;justify-content:center;font-size:3em;width:100%;height:100%;">🔒</div>
        </div>
        <div class="dog-card-info">
          <div class="dog-card-name">${dog.name}</div>
          <div style="font-size:11px;color:var(--text-muted);margin:4px 0;">Production de base : +${fmt(RARITY[dog.rarity].baseProduction)}/h</div>
          <button class="${can?'btn-ameliorer':'btn-verrouille'}" onclick="${can?`unlockDog('${dog.id}')`:''}" style="${can?'':'cursor:default;'}">
            ${can?'🔓':'🔒'} ${fmt(dog.unlockCost)} 🦴
          </button>
        </div>
      </div>`;
    });
    // Luna (drop uniquement)
    const luna = ALL_DOGS.find(d => d.id === 'luna');
    if (luna && !luna.unlocked) {
      html += `
      <div class="dog-card" style="opacity:0.6">
        <div class="dog-card-img" style="filter:grayscale(0.7)">
          <div class="rarity-badge" style="background:#E67E22">LÉGENDAIRE</div>
          <div style="display:flex;align-items:center;justify-content:center;font-size:3em;width:100%;height:100%;">❓</div>
        </div>
        <div class="dog-card-info">
          <div class="dog-card-name">Luna</div>
          <div style="font-size:11px;color:var(--text-muted);margin:4px 0;">Drop uniquement — joue pour l'obtenir !</div>
          <button class="btn-verrouille" style="cursor:default;">🎲 Drop aléatoire</button>
        </div>
      </div>`;
    }
  }

  container.innerHTML = html;

  // Mettre à jour les stats en haut
  const activeDogs = ALL_DOGS.filter(d => d.active);
  const totalProd  = Math.round(getTotalProduction() * getStreakMult());
  const elActive = document.getElementById('dogActiveCount');
  const elProd   = document.getElementById('dogProdTotal');
  if (elActive) elActive.textContent = '🦴 ' + activeDogs.length + '/' + MAX_ACTIVE;
  if (elProd)   elProd.textContent   = '🦴 ' + fmt(totalProd) + ' /h';
}

// ===== QUÊTES =====
function renderQuests() {
  const tab = document.getElementById('qtab-weekly')?.classList.contains('active') ? 'weekly'
            : document.getElementById('qtab-defis')?.classList.contains('active')  ? 'defis'
            : 'daily';

  if (tab === 'daily')  renderQuestsDaily();
  if (tab === 'weekly') renderQuestsWeekly();
  if (tab === 'defis')  renderQuestsDefis();
}

function renderQuestsDaily() {
  const container = document.getElementById('quetes-daily-content');
  if (!container) return;
  const q = state.questsDaily;
  const midnight = new Date(); midnight.setHours(24,0,0,0);
  const diff = midnight - Date.now();
  const h = Math.floor(diff/3600000), m = Math.floor((diff%3600000)/60000);
  container.innerHTML = `
    <div style="background:rgba(245,166,35,0.08);border:1px solid rgba(245,166,35,0.2);border-radius:10px;padding:8px 12px;margin-bottom:10px;display:flex;align-items:center;gap:6px;">
      <span>⏱️</span><span style="font-size:11px;color:var(--text-muted);">NOUVELLES QUÊTES DANS :</span>
      <span style="font-size:12px;font-weight:900;color:var(--gold);">${h}h ${m}m</span>
    </div>
    ${questCard('🐾','Taper 50 fois','Tape sur Paco 50 fois.',q.tap50.progress,50,'🦴 2,000',q.tap50.claimed||false,'tap50')}
    ${questCard('🏆','Taper 200 fois','Deviens un vrai DogMaster !',q.tap200.progress,200,'💎 15',q.tap200.claimed||false,'tap200')}
    ${questCard('🔓','Débloquer un chien','Ajoute un nouveau chien.',q.unlock.done?1:0,1,'🦴 5,000 + 💎 5',q.unlock.claimed||false,'unlock')}
    ${questCard('📅','Connexion du jour','Tu es là — bien joué !',1,1,'🦴 1,000',q.login?.claimed||false,'login')}
  `;
}

function renderQuestsWeekly() {
  const container = document.getElementById('quetes-weekly-content');
  if (!container) return;
  const q = state.questsWeekly;
  // Reset hebdo le lundi
  const now = new Date();
  const monday = new Date(now); monday.setDate(now.getDate() - now.getDay() + 1); monday.setHours(0,0,0,0);
  const nextMonday = new Date(monday); nextMonday.setDate(monday.getDate() + 7);
  const diff = nextMonday - now;
  const days = Math.floor(diff/86400000);
  const hrs  = Math.floor((diff%86400000)/3600000);
  container.innerHTML = `
    <div style="background:rgba(245,166,35,0.08);border:1px solid rgba(245,166,35,0.2);border-radius:10px;padding:8px 12px;margin-bottom:10px;display:flex;align-items:center;gap:6px;">
      <span>📅</span><span style="font-size:11px;color:var(--text-muted);">RESET DANS :</span>
      <span style="font-size:12px;font-weight:900;color:var(--gold);">${days}j ${hrs}h</span>
    </div>
    ${questCard('🐾','Taper 1 000 fois','Tape Paco 1000 fois cette semaine.',q.tap1000.progress,1000,'🦴 20,000 + 💎 50',q.tap1000.done,'w_tap1000')}
    ${questCard('🏆','Taper 5 000 fois','Un vrai champion du tap !',q.tap5000.progress,5000,'💎 150',q.tap5000.done,'w_tap5000')}
    ${questCard('🔓','Débloquer 3 chiens','Agrandis ta meute cette semaine.',q.unlock3.progress,3,'🦴 30,000 + 💎 30',q.unlock3.done,'w_unlock3')}
  `;
}

function renderQuestsDefis() {
  const container = document.getElementById('quetes-defis-content');
  if (!container) return;
  const d = state.defis;
  const unlockedCount = ALL_DOGS.filter(dog => dog.unlocked).length;
  container.innerHTML = `
    <div style="background:rgba(155,89,182,0.1);border:1px solid rgba(155,89,182,0.3);border-radius:10px;padding:8px 12px;margin-bottom:10px;">
      <span style="font-size:11px;color:#C39BD3;font-weight:800;">🏅 DÉFIS — Permanents, à compléter une seule fois</span>
    </div>
    ${questCard('🎯','Atteindre le niveau 10','Monte jusqu\'au niveau 10 joueur.',Math.min(state.playerLevel,10),10,'💎 100',d.reach10.done,'d_reach10')}
    ${questCard('🐕','Débloquer 5 chiens','Constitue une vraie meute.',Math.min(unlockedCount,5),5,'💎 200 + 🦴 50,000',d.unlock5.done,'d_unlock5')}
    ${questCard('💰','Gagner 100 000 Bones','Accumule 100 000 Bones au total.',Math.min(state.totalBonesEarned||0,100000),100000,'💎 300',d.earn100k.done,'d_earn100k')}
  `;
}
function questCard(icon,title,desc,prog,max,reward,done,key) {
  const pct = Math.round((prog/max)*100);
  const complete = prog >= max;
  let btn = done
    ? '<div style="font-size:22px;color:#2ECC71;">✅</div>'
    : complete
      ? `<button onclick="collectQuest('${key}')" style="background:linear-gradient(135deg,#27AE60,#2ECC71);border:none;border-radius:8px;padding:6px 12px;font-size:11px;font-weight:900;color:white;cursor:pointer;">RÉCLAMER !</button>`
      : '<span style="font-size:11px;color:var(--text-muted);">En cours…</span>';
  return `
  <div style="background:var(--bg-card);border:1px solid rgba(245,166,35,0.2);border-radius:14px;padding:12px;margin-bottom:8px;display:flex;align-items:center;gap:10px;${done?'opacity:0.7':''}">
    <div style="width:48px;height:48px;background:linear-gradient(135deg,#3a1500,#6a3000);border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0;">${icon}</div>
    <div style="flex:1;min-width:0;">
      <div style="font-size:13px;font-weight:900;">${title}</div>
      <div style="font-size:10px;color:var(--text-muted);margin-top:2px;">${desc}</div>
      <div style="height:6px;background:rgba(255,255,255,0.07);border-radius:3px;margin-top:6px;overflow:hidden;">
        <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,${complete?'#27AE60,#2ECC71':'var(--gold-dark),var(--gold-light)'});border-radius:3px;"></div>
      </div>
      <div style="font-size:9px;color:var(--text-muted);margin-top:2px;">${prog} / ${max}</div>
    </div>
    <div style="text-align:right;flex-shrink:0;">
      <div style="font-size:9px;color:var(--text-muted);">RÉCOMPENSE</div>
      <div style="font-size:12px;font-weight:900;color:var(--gold-light);">${reward}</div>
      <div style="margin-top:4px;">${btn}</div>
    </div>
  </div>`;
}
const QUEST_REWARDS = {
  // Quotidiennes
  tap50:     { bones:2000,  diamonds:0   },
  tap200:    { bones:0,     diamonds:15  },
  unlock:    { bones:5000,  diamonds:5   },
  login:     { bones:1000,  diamonds:0   },
  // Hebdomadaires
  w_tap1000: { bones:20000, diamonds:50  },
  w_tap5000: { bones:0,     diamonds:150 },
  w_unlock3: { bones:30000, diamonds:30  },
  // Défis
  d_reach10: { bones:0,     diamonds:100 },
  d_unlock5: { bones:50000, diamonds:200 },
  d_earn100k:{ bones:0,     diamonds:300 },
};
function collectQuest(key) {
  let q;
  if (key.startsWith('w_')) q = state.questsWeekly[key.slice(2)];
  else if (key.startsWith('d_')) q = state.defis[key.slice(2)];
  else q = state.questsDaily[key];
  if (!q) return;
  // Vérifier que la quête est complète et pas encore réclamée
  if (q.claimed) return;
  const isDone = key === 'login' ? true : (q.done || (q.progress !== undefined && q.progress >= (key === 'tap50' ? 50 : key === 'tap200' ? 200 : 1)));
  if (!isDone) return;
  q.claimed = true;
  q.done = true;
  const r = QUEST_REWARDS[key];
  if (!r) return;
  state.bones    += r.bones;
  state.diamonds += r.diamonds;
  const msg = [];
  if (r.bones)    msg.push('🦴 +' + fmt(r.bones));
  if (r.diamonds) msg.push('💎 +' + r.diamonds);
  showToast(msg.join(' ') + ' réclamés !');
  updateUI(); renderQuests(); saveState();
}

// ===== NAVIGATION =====
// ===== COLLECTION NFT =====
function renderCollection() {
  const container = document.getElementById('collectionContent');
  const counter   = document.getElementById('nftCount');
  if (!container) return;

  const total = state.wonNFTs.length;
  if (counter) counter.textContent = total + (total > 1 ? ' NFT' : ' NFT');

  if (total === 0) {
    container.innerHTML = `
    <div style="text-align:center;padding:40px 20px;">
      <div style="font-size:48px;margin-bottom:12px;">🎲</div>
      <div style="font-size:16px;font-weight:900;color:var(--gold);margin-bottom:8px;">Aucun NFT pour l'instant</div>
      <div style="font-size:12px;color:var(--text-muted);line-height:1.5;">Continue à taper sur Paco —<br>un NFT peut tomber à tout moment !</div>
    </div>`;
    return;
  }

  // Grouper par collection
  const collections = {};
  state.wonNFTs.forEach(nft => {
    if (!collections[nft.collection]) collections[nft.collection] = [];
    collections[nft.collection].push(nft);
  });

  // Couleurs par rareté
  const rarityColor = {
    'LEGENDARY': '#E67E22',
    'EPIC':      '#9B59B6',
    'RARE':      '#3498DB',
    'UNCOMMON':  '#27AE60',
    'COMMON':    '#9D9D9D',
  };

  let html = '';
  const collOrder = ['Genesis', 'Saison 1', 'Thématique'];
  collOrder.forEach(collName => {
    const nfts = collections[collName];
    if (!nfts || nfts.length === 0) return;

    html += `<div style="margin-bottom:20px;">
      <div style="font-size:11px;font-weight:900;color:var(--gold);text-transform:uppercase;letter-spacing:2px;margin-bottom:10px;">
        ${collName === 'Genesis' ? '⭐' : collName === 'Saison 1' ? '🏆' : '🎭'} ${collName}
        <span style="font-size:10px;color:var(--text-muted);font-weight:700;margin-left:6px;">${nfts.length} NFT</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;">`;

    nfts.forEach(nft => {
      // Extraire la clé de rareté depuis la string
      let color = '#9D9D9D';
      if (nft.rarity.includes('Légendaire')) color = '#E67E22';
      else if (nft.rarity.includes('Épique'))    color = '#9B59B6';
      else if (nft.rarity.includes('Rare'))       color = '#3498DB';
      else if (nft.rarity.includes('Commun'))     color = '#27AE60';

      html += `
        <div style="background:var(--bg-card);border:2px solid ${color};border-radius:14px;padding:12px;display:flex;flex-direction:column;align-items:center;gap:6px;position:relative;">
          <div style="font-size:36px;">🐶</div>
          <div style="font-size:10px;font-weight:900;color:${color};text-align:center;">${nft.rarity.split('·')[0].trim()}</div>
          <div style="font-size:12px;font-weight:900;text-align:center;line-height:1.3;">${nft.name}</div>
          <div style="font-size:9px;color:var(--text-muted);">Gagné le ${nft.date}</div>
        </div>`;
    });

    html += `</div></div>`;
  });

  container.innerHTML = html;
}

function navigate(screen) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active','slide-in'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('screen-' + screen).classList.add('active','slide-in');
  const nav = document.getElementById('nav-' + screen);
  if (nav) nav.classList.add('active');
  currentScreen = screen;
  const isHome = screen === 'home';
  document.getElementById('bgHome').classList.toggle('dimmed', !isHome);
  document.getElementById('bgDark').classList.toggle('active', !isHome);
  document.getElementById('topbar').className = 'topbar ' + (isHome ? 'home-bar' : 'dark-bar');
  closeDogsPanel();
  // Render selon écran
  if (screen === 'chiens')      renderDogCards();
  if (screen === 'quetes')      renderQuests();
  if (screen === 'collection')  renderCollection();
  if (screen === 'pass')        updatePass();
  if (screen === 'classement')   renderClassement();
  if (screen === 'evenements')   startEventCountdown();
}

function switchQueteTab(tab) {
  ['daily','weekly','defis'].forEach(t => {
    const el = document.getElementById('quetes-' + t);
    if (el) el.style.display = t === tab ? 'block' : 'none';
  });
  document.querySelectorAll('#screen-quetes .tab').forEach(t => t.classList.remove('active'));
  const tabEl = document.getElementById('qtab-' + tab);
  if (tabEl) tabEl.classList.add('active');
  const labels = { daily:'QUOTIDIENNES', weekly:'HEBDOMADAIRES', defis:'DÉFIS' };
  const sub = document.getElementById('quetesSubtitle');
  if (sub) sub.textContent = labels[tab];
  renderQuests();
}

// ===== RESET JEU =====
// ===== CLASSEMENT =====
const FAKE_PLAYERS = [
  { name:'AlphaKing',    score:98750000, badge:'🛡️ Légende' },
  { name:'BoneCollector',score:76320000, badge:'🛡️ Maître'  },
  { name:'PacoLover',    score:64180000, badge:'🛡️ Maître'  },
  { name:'DogWhisperer', score:52900000, badge:'🛡️ Légende' },
  { name:'LunaFan',      score:48210000, badge:'🛡️ Maître'  },
  { name:'PuppyLegend',  score:41770000, badge:'🛡️ Maître'  },
  { name:'BullyBoss',    score:37450000, badge:'🛡️ Maître'  },
  { name:'SnowPup',      score:35120000, badge:'🛡️ Légende' },
];

// ===== ÉVÉNEMENTS =====
let eventCountdownInterval = null;
function startEventCountdown() {
  // Date de fin de l'événement Halloween (exemple : 6 jours à partir d'aujourd'hui)
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + 6);
  endDate.setHours(endDate.getHours() + 14);
  endDate.setMinutes(endDate.getMinutes() + 32);

  if (eventCountdownInterval) clearInterval(eventCountdownInterval);
  function update() {
    const now = Date.now();
    const diff = endDate - now;
    if (diff <= 0) { clearInterval(eventCountdownInterval); return; }
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const el = document.getElementById('eventCountdown');
    if (el) el.textContent = d + 'j ' + h + 'h ' + m + 'm';
  }
  update();
  eventCountdownInterval = setInterval(update, 60000);
}

function renderClassement() {
  const myScore = Math.floor(state.bones);
  // Calculer mon rang parmi les fictifs
  const rank = FAKE_PLAYERS.filter(p => p.score > myScore).length + 1;
  const xpPct = Math.round((state.playerXP / (state.playerLevel * 100)) * 100);

  const elRank  = document.getElementById('playerRank');
  const elScore = document.getElementById('playerScore');
  const elLvl   = document.getElementById('playerLvlBadge');
  const elBar   = document.getElementById('playerLvlBar');
  if (elRank)  elRank.textContent  = rank;
  if (elScore) elScore.textContent = fmt(myScore) + ' 🦴';
  if (elLvl)   elLvl.textContent   = state.playerLevel;
  if (elBar)   elBar.style.width   = xpPct + '%';
}

// ===== SHOP =====
function navigateShopSection(section) {
  navigate('shop');
  setTimeout(() => {
    const el = document.getElementById('shop-section-' + section);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 150);
}

function buyChest(type) {
  const costs = { COMMON:{ bones:2000, diamonds:0 }, RARE:{ bones:0, diamonds:200 }, LEGENDARY:{ bones:0, diamonds:500 } };
  const c = costs[type];
  if (c.bones > 0 && state.bones < c.bones) { showToast('Pas assez de Bones ! 🦴'); return; }
  if (c.diamonds > 0 && state.diamonds < c.diamonds) { showToast('Pas assez de Diamants ! 💎'); return; }
  state.bones -= c.bones;
  state.diamonds -= c.diamonds;
  const bonusMap = { COMMON:1000, UNCOMMON:3000, RARE:8000, EPIC:25000, LEGENDARY:80000 };
  const chances = {
    COMMON:    { COMMON:0.6, UNCOMMON:0.3, RARE:0.1 },
    RARE:      { UNCOMMON:0.3, RARE:0.5, EPIC:0.2 },
    LEGENDARY: { RARE:0.2, EPIC:0.5, LEGENDARY:0.3 },
  };
  let r = Math.random(), cumul = 0, won = 'COMMON';
  for (const [rarity, prob] of Object.entries(chances[type])) { cumul += prob; if (r < cumul) { won = rarity; break; } }
  state.bones += bonusMap[won];
  const labels = { COMMON:'Commun', UNCOMMON:'Peu Commun', RARE:'Rare', EPIC:'Épique', LEGENDARY:'Légendaire' };
  updateUI(); saveState();
  showToast('🎲 ' + labels[won] + ' — 🦴 +' + fmt(bonusMap[won]) + ' !');
}

function buyBoost(type) {
  const costs = { production:150, chance:200 };
  if (state.diamonds < costs[type]) { showToast('Pas assez de Diamants ! 💎'); return; }
  state.diamonds -= costs[type];
  state.boostActive = true;
  state.boostEnd = Date.now() + (type === 'production' ? 7200000 : 3600000);
  if (type === 'chance') Object.keys(state.pityCounters).forEach(r => state.pityCounters[r] += 100);
  updateUI(); saveState();
  showToast(type === 'production' ? '⚡ Production x2 activée 2h !' : '🍀 Chance NFT x3 activée 1h !');
}

function buyBones() {
  if (state.diamonds < 100) { showToast('Pas assez de Diamants ! 💎'); return; }
  state.diamonds -= 100;
  state.bones += 500000;
  updateUI(); saveState();
  showToast('🦴 +500,000 Bones !');
}

function buyPack(type) {
  // Les packs nécessiteront Telegram Stars — pour l'instant message info
  showToast('💳 Paiement bientôt disponible via Telegram Stars !');
}

function buySpecialOffer() {
  showToast('🔥 Offre spéciale bientôt disponible !');
}

function resetGame() {
  if (!confirm('Réinitialiser toute ta progression ? Cette action est irréversible.')) return;
  localStorage.removeItem('packoo_save');
  location.reload();
}

// ===== MENU HAMBURGER =====
function toggleMenu() {
  const panel = document.getElementById('menuPanel');
  if (panel) panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
}

// ===== PASS SAISON =====
function activatePass() {
  if (state.passActivated) { showToast('Pass déjà activé !'); return; }
  if (state.diamonds < 499) { showToast('Pas assez de Diamants ! 💎'); return; }
  state.diamonds -= 499;
  state.passActivated = true;
  updateUI();
  saveState();
  showToast('👑 Pass Saison activé !');
  updatePass();
}

function updatePass() {
  const el = document.getElementById('passLevelDisplay');
  if (el) el.textContent = state.passLevel;
  const elPts = document.getElementById('passPointsDisplay');
  if (elPts) elPts.textContent = state.passPoints;
  const elBar = document.getElementById('passLevelBar');
  const ptsForNextLevel = 100;
  const pct = Math.min(100, Math.round((state.passPoints % ptsForNextLevel) / ptsForNextLevel * 100));
  if (elBar) elBar.style.width = pct + '%';
  const elBtn = document.getElementById('passActivateBtn');
  if (elBtn) {
    elBtn.textContent = state.passActivated ? '✅ Pass activé' : 'ACTIVER LE PASS 💎 499';
    elBtn.style.opacity = state.passActivated ? '0.6' : '1';
    elBtn.style.cursor = state.passActivated ? 'default' : 'pointer';
  }
}

function openDogsPanel()  {
  document.getElementById('dogsPanel').classList.add('open');
  document.getElementById('panelBackdrop').classList.add('open');
}
function closeDogsPanel() {
  document.getElementById('dogsPanel').classList.remove('open');
  document.getElementById('panelBackdrop').classList.remove('open');
}

// ===== INIT =====
loadState();
updateUI();
// Popup offline earnings
if (state._offlineEarned > 0) {
  const h = Math.floor(state._offlineSeconds / 3600);
  const m = Math.floor((state._offlineSeconds % 3600) / 60);
  const duree = h > 0 ? h + 'h ' + m + 'min' : m + 'min';
  setTimeout(() => showToast('😴 Absent ' + duree + ' — +' + fmt(state._offlineEarned) + ' Bones gagnés !'), 800);
  delete state._offlineEarned;
  delete state._offlineSeconds;
}
updatePass();
setTimeout(() => updateQuestBadge(), 200);

// Render initial
renderDogCards();
renderQuests();
