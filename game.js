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
  passClaimedTiers: [],
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
    reach10: { done:false, claimed:false }, // atteindre niveau 10
    unlock5: { done:false, claimed:false }, // débloquer 5 chiens
    earn100k: { done:false, claimed:false }, // gagner 100k bones total
  },
  totalBonesEarned: 0,
  // Chasse aux Os
  osWeeklyCount: 0,         // os récupérés cette semaine (0-28)
  osWeeklyStart: 0,         // timestamp début de semaine
  osDailyCount: 0,          // os récupérés aujourd'hui (0-4)
  osLastDay: '',            // date du dernier os
  // Coffres
  coffres: { bronze:0, argent:0, or:0, event:0 },
  // Inventaire
  inventaire: { tickets:0, boosts:0, keys:0, fragments:0, luck:0 },
  // Cadeau quotidien
  dailyGiftClaimed: false,
  dailyGiftDate: '',
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
      const maxOffline = 8 * 3600; // plafond de base : 8h
      const effectiveSeconds = Math.min(secondsOffline, maxOffline);
      if (effectiveSeconds > 60) {
        const prod = ALL_DOGS
          .filter(d => d.unlocked && d.active)
          .reduce((sum, d) => sum + getProduction(d.rarity, d.level, d.id), 0);
        const fullEarned = Math.floor(prod * effectiveSeconds / 3600);
        if (fullEarned > 0) {
          // On donne 40% directement, le reste est proposé via pub
          const earned40  = Math.floor(fullEarned * 0.4);
          const earned80  = Math.floor(fullEarned * 0.8);
          const earned100 = fullEarned;
          state.bones += earned40;
          // Stocker les infos pour la popup
          state._offlineEarned    = earned40;      // ce qu'on a déjà reçu
          state._offlineEarned80  = earned80;      // total si pub
          state._offlineEarned100 = earned100;     // total si pub + pass
          state._offlineSeconds   = effectiveSeconds;
          state._offlineFullProd  = fullEarned;    // pour calculer le bonus à ajouter
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
      // Reset cadeau quotidien
      state.dailyGiftClaimed = false;
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
  updateUpgradeBadge();
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
  // Badge cadeaux
  updateCadeauBadge();
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
  if (!state.defis.reach10.done && state.playerLevel >= 10) state.defis.reach10.done = true;
  const _unlockedCount = ALL_DOGS.filter(d => d.unlocked).length;
  if (!state.defis.unlock5.done && _unlockedCount >= 5) state.defis.unlock5.done = true;
  if (!state.defis.earn100k.done && (state.totalBonesEarned||0) >= 100000) state.defis.earn100k.done = true;
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

function updateUpgradeBadge() {
  const badge = document.getElementById('upgradeBadge');
  if (!badge) return;
  const canUpgrade = ALL_DOGS.some(d => {
    if (!d.unlocked || !d.active) return false;
    const cost = getLevelCost(d.rarity, d.level, d.id);
    return cost && state.bones >= cost;
  });
  badge.style.display = canUpgrade ? 'flex' : 'none';
}

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
  if (screen === 'cadeaux')      renderCadeaux();
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
  window._state = state;
  if (typeof renderPassRewards === 'function') renderPassRewards();
  updatePass();
}

const PASS_REWARDS = [
  { tier:1,  free:{icon:'🦴', label:'25K Bones',          type:'bones',    value:25000},   premium:{icon:'🦴', label:'100K Bones',         type:'bones',    value:100000} },
  { tier:2,  free:{icon:'💎', label:'25 Diamants',         type:'diamonds', value:25},      premium:{icon:'💎', label:'100 Diamants',        type:'diamonds', value:100} },
  { tier:3,  free:{icon:'📦', label:'Coffre Commun',       type:'chest',    value:'common'},premium:{icon:'📦', label:'Coffre Rare',         type:'chest',    value:'rare'} },
  { tier:4,  free:{icon:'🦴', label:'30K Bones',          type:'bones',    value:30000},   premium:{icon:'⚡', label:'Boost ×2 (2h)',        type:'boost',    value:'2h'} },
  { tier:5,  free:{icon:'⚡', label:'Boost ×2 (30min)',   type:'boost',    value:'30m'},   premium:{icon:'🖼️', label:'Cadre Profil S1',      type:'cosmetic', value:'frame_s1'} },
  { tier:6,  free:{icon:'🦴', label:'40K Bones',          type:'bones',    value:40000},   premium:{icon:'🦴', label:'150K Bones',          type:'bones',    value:150000} },
  { tier:7,  free:{icon:'🦴', label:'50K Bones',          type:'bones',    value:50000},   premium:{icon:'✨', label:'Aura Lumineuse',       type:'cosmetic', value:'aura'} },
  { tier:8,  free:{icon:'💎', label:'30 Diamants',         type:'diamonds', value:30},      premium:{icon:'📦', label:'Coffre Épique',        type:'chest',    value:'epic'} },
  { tier:9,  free:{icon:'🦴', label:'60K Bones',          type:'bones',    value:60000},   premium:{icon:'🦴', label:'180K Bones',          type:'bones',    value:180000} },
  { tier:10, free:{icon:'📦', label:'Coffre Rare',         type:'chest',    value:'rare'},  premium:{icon:'🐶', label:'Skin Paco Exclusif',   type:'cosmetic', value:'skin_paco_s1'} },
  { tier:11, free:{icon:'🦴', label:'70K Bones',          type:'bones',    value:70000},   premium:{icon:'🦴', label:'200K Bones',          type:'bones',    value:200000} },
  { tier:12, free:{icon:'💎', label:'50 Diamants',         type:'diamonds', value:50},      premium:{icon:'💎', label:'200 Diamants',         type:'diamonds', value:200} },
  { tier:13, free:{icon:'🦴', label:'80K Bones',          type:'bones',    value:80000},   premium:{icon:'🦴', label:'220K Bones',          type:'bones',    value:220000} },
  { tier:14, free:{icon:'⚡', label:'Boost ×2 (1h)',      type:'boost',    value:'1h'},    premium:{icon:'⚡', label:'Boost ×2 (3h)',        type:'boost',    value:'3h'} },
  { tier:15, free:{icon:'🎨', label:'Cosmétique Simple',  type:'cosmetic', value:'bg_s1'}, premium:{icon:'🏅', label:'Badge Premium S1',     type:'cosmetic', value:'badge_premium'} },
  { tier:16, free:{icon:'🦴', label:'90K Bones',          type:'bones',    value:90000},   premium:{icon:'🦴', label:'250K Bones',          type:'bones',    value:250000} },
  { tier:17, free:{icon:'💎', label:'60 Diamants',         type:'diamonds', value:60},      premium:{icon:'💎', label:'220 Diamants',         type:'diamonds', value:220} },
  { tier:18, free:{icon:'🦴', label:'100K Bones',         type:'bones',    value:100000},  premium:{icon:'🎲', label:'Boost NFT ×3',         type:'boost',    value:'nft3'} },
  { tier:19, free:{icon:'📦', label:'Coffre Rare',         type:'chest',    value:'rare'},  premium:{icon:'🦴', label:'280K Bones',          type:'bones',    value:280000} },
  { tier:20, free:{icon:'📦', label:'Coffre Rare',         type:'chest',    value:'rare'},  premium:{icon:'📦', label:'Coffre Légendaire',    type:'chest',    value:'legendary'} },
  { tier:21, free:{icon:'🦴', label:'110K Bones',         type:'bones',    value:110000},  premium:{icon:'🦴', label:'300K Bones',          type:'bones',    value:300000} },
  { tier:22, free:{icon:'💎', label:'70 Diamants',         type:'diamonds', value:70},      premium:{icon:'🎭', label:'Emote Exclusive',      type:'cosmetic', value:'emote_s1'} },
  { tier:23, free:{icon:'🦴', label:'120K Bones',         type:'bones',    value:120000},  premium:{icon:'🦴', label:'320K Bones',          type:'bones',    value:320000} },
  { tier:24, free:{icon:'⚡', label:'Boost ×2 (1h)',      type:'boost',    value:'1h'},    premium:{icon:'💎', label:'250 Diamants',         type:'diamonds', value:250} },
  { tier:25, free:{icon:'🏅', label:'Badge S1',           type:'cosmetic', value:'badge_s1'},premium:{icon:'🖼️',label:'Fond Profil Animé',   type:'cosmetic', value:'bg_animated'} },
  { tier:26, free:{icon:'🦴', label:'130K Bones',         type:'bones',    value:130000},  premium:{icon:'🦴', label:'350K Bones',          type:'bones',    value:350000} },
  { tier:27, free:{icon:'💎', label:'80 Diamants',         type:'diamonds', value:80},      premium:{icon:'💎', label:'280 Diamants',         type:'diamonds', value:280} },
  { tier:28, free:{icon:'📦', label:'Coffre Rare',         type:'chest',    value:'rare'},  premium:{icon:'📦', label:'Coffre Épique',        type:'chest',    value:'epic'} },
  { tier:29, free:{icon:'🦴', label:'140K Bones',         type:'bones',    value:140000},  premium:{icon:'🦴', label:'380K Bones',          type:'bones',    value:380000} },
  { tier:30, free:{icon:'🎲', label:'Boost NFT ×2',       type:'boost',    value:'nft2'},  premium:{icon:'🦴', label:'500K Bones',          type:'bones',    value:500000} },
  { tier:31, free:{icon:'🦴', label:'150K Bones',         type:'bones',    value:150000},  premium:{icon:'🦴', label:'400K Bones',          type:'bones',    value:400000} },
  { tier:32, free:{icon:'💎', label:'90 Diamants',         type:'diamonds', value:90},      premium:{icon:'💎', label:'300 Diamants',         type:'diamonds', value:300} },
  { tier:33, free:{icon:'⚡', label:'Boost ×2 (2h)',      type:'boost',    value:'2h'},    premium:{icon:'⚡', label:'Boost ×3 (3h)',        type:'boost',    value:'3h_x3'} },
  { tier:34, free:{icon:'🦴', label:'160K Bones',         type:'bones',    value:160000},  premium:{icon:'🦴', label:'450K Bones',          type:'bones',    value:450000} },
  { tier:35, free:{icon:'💎', label:'100 Diamants',        type:'diamonds', value:100},     premium:{icon:'✨', label:'Animation Spéciale',   type:'cosmetic', value:'anim_s1'} },
  { tier:36, free:{icon:'🦴', label:'170K Bones',         type:'bones',    value:170000},  premium:{icon:'🦴', label:'480K Bones',          type:'bones',    value:480000} },
  { tier:37, free:{icon:'📦', label:'Coffre Épique',       type:'chest',    value:'epic'},  premium:{icon:'📦', label:'Coffre Épique',        type:'chest',    value:'epic'} },
  { tier:38, free:{icon:'🦴', label:'180K Bones',         type:'bones',    value:180000},  premium:{icon:'🦴', label:'500K Bones',          type:'bones',    value:500000} },
  { tier:39, free:{icon:'💎', label:'110 Diamants',        type:'diamonds', value:110},     premium:{icon:'💎', label:'350 Diamants',         type:'diamonds', value:350} },
  { tier:40, free:{icon:'📦', label:'Coffre Épique',       type:'chest',    value:'epic'},  premium:{icon:'📦', label:'Coffre Mythique',      type:'chest',    value:'mythic'} },
  { tier:41, free:{icon:'🦴', label:'190K Bones',         type:'bones',    value:190000},  premium:{icon:'🦴', label:'550K Bones',          type:'bones',    value:550000} },
  { tier:42, free:{icon:'💎', label:'120 Diamants',        type:'diamonds', value:120},     premium:{icon:'💎', label:'400 Diamants',         type:'diamonds', value:400} },
  { tier:43, free:{icon:'⚡', label:'Boost ×2 (2h)',      type:'boost',    value:'2h'},    premium:{icon:'⚡', label:'Boost ×3 (4h)',        type:'boost',    value:'4h_x3'} },
  { tier:44, free:{icon:'🦴', label:'200K Bones',         type:'bones',    value:200000},  premium:{icon:'🦴', label:'600K Bones',          type:'bones',    value:600000} },
  { tier:45, free:{icon:'🎨', label:'Cosmétique Animé',   type:'cosmetic', value:'anim_bg'},premium:{icon:'👑',label:'Titre Exclusif S1',    type:'cosmetic', value:'title_s1'} },
  { tier:46, free:{icon:'🦴', label:'220K Bones',         type:'bones',    value:220000},  premium:{icon:'🦴', label:'650K Bones',          type:'bones',    value:650000} },
  { tier:47, free:{icon:'💎', label:'130 Diamants',        type:'diamonds', value:130},     premium:{icon:'💎', label:'450 Diamants',         type:'diamonds', value:450} },
  { tier:48, free:{icon:'📦', label:'Coffre Épique',       type:'chest',    value:'epic'},  premium:{icon:'📦', label:'Coffre Mythique',      type:'chest',    value:'mythic'} },
  { tier:49, free:{icon:'🦴', label:'250K Bones',         type:'bones',    value:250000},  premium:{icon:'🦴', label:'700K Bones',          type:'bones',    value:700000} },
  { tier:50, free:{icon:'🏆', label:'Récompense Finale S1',type:'cosmetic',value:'final_free'},premium:{icon:'🌟',label:'Récompense Finale Exclusive',type:'cosmetic',value:'final_premium'} },
];
function renderPassRewards() {
  const el = document.getElementById('passRewardsList');
  if (!el) return;
  const activated = state && state.passActivated;
  const passLevel = state ? (state.passLevel || 1) : 1;
  const claimed = state ? (state.passClaimedTiers || []) : [];

  el.innerHTML = PASS_REWARDS.map(r => {
    const done = r.tier <= passLevel;
    const keyFree    = r.tier + '_free';
    const keyPremium = r.tier + '_premium';
    const claimedFree    = claimed.includes(keyFree);
    const claimedPremium = claimed.includes(keyPremium);
    const canClaimFree    = done && !claimedFree;
    const canClaimPremium = done && !claimedPremium;
    return `
    <div style="display:flex;gap:8px;margin-bottom:8px;align-items:center;">
      <!-- Gratuit -->
      <div style="flex:1;background:${done ? 'rgba(245,166,35,0.08)' : 'rgba(255,255,255,0.03)'};border:1px solid ${done ? 'rgba(245,166,35,0.3)' : 'rgba(100,100,100,0.15)'};border-radius:12px;padding:8px;display:flex;flex-direction:column;align-items:center;gap:3px;text-align:center;">
        <span style="font-size:20px;">${r.free.icon}</span>
        <span style="font-size:10px;font-weight:900;color:${done ? 'var(--gold-light)' : 'var(--text-muted)'};">${r.free.label}</span>
        ${canClaimFree ? `<button onclick="claimPassReward(${r.tier},'free')" style="margin-top:2px;background:linear-gradient(135deg,var(--gold-dark),var(--gold));border:none;border-radius:6px;padding:3px 8px;font-size:9px;font-weight:900;color:#1A0F00;cursor:pointer;">RÉCLAMER</button>` : done ? '<span style="font-size:12px;color:#2ECC71;">✓</span>' : ''}
      </div>
      <!-- Numéro palier -->
      <div style="background:linear-gradient(135deg,var(--gold-dark),var(--gold));color:#1A0F00;font-size:10px;font-weight:900;width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${r.tier}</div>
      <!-- Premium -->
      <div style="flex:1;background:${activated && done ? 'rgba(245,166,35,0.1)' : 'rgba(20,10,0,0.6)'};border:1px solid ${activated && done ? 'rgba(245,166,35,0.35)' : 'rgba(100,100,100,0.15)'};border-radius:12px;padding:8px;display:flex;flex-direction:column;align-items:center;gap:3px;text-align:center;">
        <span style="font-size:20px;">${r.premium.icon}</span>
        <span style="font-size:10px;font-weight:900;color:${activated && done ? 'var(--gold-light)' : 'var(--text-muted)'};">${r.premium.label}</span>
        ${activated && canClaimPremium ? `<button onclick="claimPassReward(${r.tier},'premium')" style="margin-top:2px;background:linear-gradient(135deg,var(--gold-dark),var(--gold));border:none;border-radius:6px;padding:3px 8px;font-size:9px;font-weight:900;color:#1A0F00;cursor:pointer;">RÉCLAMER</button>` : activated && done ? '<span style="font-size:12px;color:#2ECC71;">✓</span>' : '<span style="font-size:14px;opacity:0.4">🔒</span>'}
      </div>
    </div>`;
  }).join('');
}

function claimPassReward(tier, type) {
  if (!state.passClaimedTiers) state.passClaimedTiers = [];
  const key = tier + '_' + type;
  if (state.passClaimedTiers.includes(key)) return;
  state.passClaimedTiers.push(key);
  const r = PASS_REWARDS.find(x => x.tier === tier);
  if (!r) return;
  const reward = type === 'free' ? r.free : r.premium;
  if (reward.type === 'bones')    { state.bones    += reward.value; showToast('🦴 +' + fmt(reward.value) + ' Bones !'); }
  if (reward.type === 'diamonds') { state.diamonds += reward.value; showToast('💎 +' + reward.value + ' Diamants !'); }
  if (reward.type === 'chest')    { showToast('📦 ' + reward.label + ' ajouté !'); }
  if (reward.type === 'boost')    { showToast('⚡ ' + reward.label + ' activé !'); }
  if (reward.type === 'cosmetic') { showToast('✨ ' + reward.label + ' débloqué !'); }
  renderPassRewards(); updateUI(); saveState();
}

function switchPassTab(tab) {
  document.getElementById('passSection-rewards').style.display = tab === 'rewards' ? 'block' : 'none';
  document.getElementById('passSection-quetes').style.display  = tab === 'quetes'  ? 'block' : 'none';
  document.getElementById('passTab-rewards').style.color = tab === 'rewards' ? 'var(--gold)' : 'var(--text-muted)';
  document.getElementById('passTab-rewards').style.background = tab === 'rewards' ? 'rgba(245,166,35,0.15)' : 'transparent';
  document.getElementById('passTab-quetes').style.color = tab === 'quetes' ? 'var(--gold)' : 'var(--text-muted)';
  document.getElementById('passTab-quetes').style.background = tab === 'quetes' ? 'rgba(245,166,35,0.15)' : 'transparent';
}

function updatePass() {
  window.state = state;
  window._state = state;
  if (typeof renderPassRewards === 'function') renderPassRewards();
  const el = document.getElementById('passLevelDisplay');
  if (el) el.textContent = state.passLevel;
  const elPts = document.getElementById('passPointsDisplay');
  if (elPts) elPts.textContent = fmt(state.passPoints || 0);
  const elBar = document.getElementById('passLevelBar');
  const ptsForNextLevel = 100;
  const pct = Math.min(100, Math.round((state.passPoints % ptsForNextLevel) / ptsForNextLevel * 100));
  if (elBar) elBar.style.width = pct + '%';
  const elBtn = document.getElementById('passActivateBtn');
  if (elBtn) {
    elBtn.textContent = state.passActivated ? '✅ Pass activé' : 'ACTIVER LE PASS — 4,99 €';
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
  setTimeout(() => showOfflinePopup(duree), 800);
}
updatePass();
setTimeout(() => updateQuestBadge(), 200);
setTimeout(() => updateCadeauBadge(), 200);

// Render initial
renderDogCards();
renderQuests();

// ============================================================
// PACKOO — ÉCRAN CADEAUX
// ============================================================

// ===== NAVIGATION ONGLETS CADEAUX =====
function switchCadeauTab(tab) {
  ['chasse','coffres','rewards','inventaire'].forEach(t => {
    const el = document.getElementById('cadeau-' + t);
    if (el) el.style.display = t === tab ? 'block' : 'none';
    const tabEl = document.getElementById('ctab-' + t);
    if (tabEl) tabEl.classList.toggle('active', t === tab);
  });
}

// ===== RENDER PRINCIPAL CADEAUX =====
function renderCadeaux() {
  renderOsChasse();
  renderCoffresTab();
  renderInventaire();
  renderDailyGift();
}

// ===== CHASSE AUX OS =====
function renderOsChasse() {
  // Reset quotidien des os
  const today = new Date().toDateString();
  if (state.osLastDay !== today) {
    state.osDailyCount = 0;
    state.osLastDay    = today;
  }
  // Reset hebdomadaire (chaque lundi)
  const now    = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  monday.setHours(0,0,0,0);
  if (!state.osWeeklyStart || state.osWeeklyStart < monday.getTime()) {
    state.osWeeklyCount  = 0;
    state.osWeeklyStart  = monday.getTime();
  }

  const count = state.osWeeklyCount || 0;
  const pct   = Math.round((count / 28) * 100);

  // Barre progression
  const bar = document.getElementById('osProgressBar');
  const txt = document.getElementById('osProgressDisplay');
  if (bar) bar.style.width = pct + '%';
  if (txt) txt.textContent = count + ' / 28';

  // Couleur barre selon palier
  if (bar) {
    if (count >= 22)      bar.style.background = 'linear-gradient(90deg,#1a6fd4,#7DD4FC)';
    else if (count >= 15) bar.style.background = 'linear-gradient(90deg,#B8860B,#FFD700)';
    else if (count >= 8)  bar.style.background = 'linear-gradient(90deg,#808080,#C0C0C0)';
    else                  bar.style.background = 'linear-gradient(90deg,#8B4513,#CD7F32)';
  }

  // Highlight palier actif
  const paliers = ['bronze','argent','or','diamant'];
  const actif   = count >= 22 ? 'diamant' : count >= 15 ? 'or' : count >= 8 ? 'argent' : 'bronze';
  paliers.forEach(p => {
    const el = document.getElementById('osPalier-' + p);
    if (!el) return;
    if (p === actif) {
      el.style.background = 'rgba(245,166,35,0.25)';
      el.style.border      = '1px solid rgba(245,166,35,0.6)';
    } else {
      el.style.background = 'rgba(255,255,255,0.03)';
      el.style.border      = '1px solid rgba(255,255,255,0.08)';
    }
  });

  // Message statut
  const msg = document.getElementById('osStatusMsg');
  if (msg) {
    const daily = state.osDailyCount || 0;
    if (daily >= 4) {
      msg.innerHTML = '✅ Tu as récupéré tes <strong style="color:var(--gold);">4 os du jour</strong> !<br><span style="color:var(--text-muted);">Reviens demain pour continuer la série.</span>';
    } else {
      msg.innerHTML = '🦴 Un os mystérieux peut tomber à tout moment...<br><span style="color:var(--gold);font-weight:800;">Reste attentif pendant que tu joues !</span>';
    }
  }

  // Timer fin de série
  const nextMonday = new Date(state.osWeeklyStart + 7 * 86400000);
  const diff       = nextMonday - Date.now();
  if (diff > 0) {
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000)  / 60000);
    const timerEl = document.getElementById('osSerieTimer');
    if (timerEl) timerEl.textContent = d + 'j ' + h + 'h ' + m + 'm';
  }
}

// Déclencher un os (appelé depuis l'accueil lors d'une apparition)
function collectOs() {
  const today = new Date().toDateString();
  if (state.osLastDay !== today) { state.osDailyCount = 0; state.osLastDay = today; }
  if ((state.osDailyCount || 0) >= 4) {
    showToast('🦴 4 os récupérés aujourd\'hui — reviens demain !');
    return;
  }

  // Simuler la pub (dans le prototype : 3s de délai)
  showToast('📺 Pub en cours… 3 secondes');
  setTimeout(() => {
    state.osDailyCount  = (state.osDailyCount  || 0) + 1;
    state.osWeeklyCount = (state.osWeeklyCount  || 0) + 1;

    // Déterminer le type d'os selon progression semaine
    const count = state.osWeeklyCount;
    let osType, reward;
    if (count >= 22) {
      osType = '💎 Os Diamant';
      reward = _rewardOsDiamant();
    } else if (count >= 15) {
      osType = '🥇 Os d\'Or';
      reward = _rewardOsOr();
    } else if (count >= 8) {
      osType = '🥈 Os d\'Argent';
      reward = _rewardOsArgent();
    } else {
      osType = '🦴 Os de Bronze';
      reward = _rewardOsBronze();
    }

    showToast(osType + ' ouvert ! ' + reward.msg);
    updateUI();
    saveState();
    if (currentScreen === 'cadeaux') renderCadeaux();
  }, 3000);
}

function _rewardOsBronze() {
  const bones = Math.floor(Math.random() * 5000) + 1000;
  state.bones += bones;
  return { msg: '🦴 +' + fmt(bones) + ' Bones !' };
}
function _rewardOsArgent() {
  const roll = Math.random();
  if (roll < 0.5) {
    const bones = Math.floor(Math.random() * 15000) + 5000;
    state.bones += bones;
    return { msg: '🦴 +' + fmt(bones) + ' Bones !' };
  } else {
    const gems = Math.floor(Math.random() * 20) + 10;
    state.diamonds += gems;
    return { msg: '💎 +' + gems + ' Diamants !' };
  }
}
function _rewardOsOr() {
  const roll = Math.random();
  if (roll < 0.4) {
    const bones = Math.floor(Math.random() * 50000) + 20000;
    state.bones += bones;
    return { msg: '🦴 +' + fmt(bones) + ' Bones !' };
  } else if (roll < 0.7) {
    const gems = Math.floor(Math.random() * 50) + 30;
    state.diamonds += gems;
    return { msg: '💎 +' + gems + ' Diamants !' };
  } else {
    state.coffres = state.coffres || {};
    state.coffres.bronze = (state.coffres.bronze || 0) + 1;
    return { msg: '📦 Coffre Bronze gagné !' };
  }
}
function _rewardOsDiamant() {
  const roll = Math.random();
  if (roll < 0.4) {
    const gems = Math.floor(Math.random() * 100) + 80;
    state.diamonds += gems;
    return { msg: '💎 +' + gems + ' Diamants !' };
  } else if (roll < 0.7) {
    state.coffres = state.coffres || {};
    state.coffres.argent = (state.coffres.argent || 0) + 1;
    return { msg: '🎁 Coffre Argent gagné !' };
  } else {
    // Gros boost chance NFT
    state.chanceScore += 200;
    return { msg: '🍀 Boost NFT +200 chance !' };
  }
}

// ===== COFFRES =====
function renderCoffresTab() {
  state.coffres = state.coffres || { bronze:0, argent:0, or:0, event:0 };
  const c = state.coffres;
  const elB = document.getElementById('coffreBronzeCount'); if (elB) elB.textContent = c.bronze || 0;
  const elA = document.getElementById('coffreArgentCount'); if (elA) elA.textContent = c.argent || 0;
  const elO = document.getElementById('coffreOrCount');     if (elO) elO.textContent = c.or     || 0;
  const elE = document.getElementById('coffreEventCount');  if (elE) elE.textContent = c.event  || 0;
  const total = (c.bronze||0) + (c.argent||0) + (c.or||0) + (c.event||0);
  const elT = document.getElementById('totalCoffresCount'); if (elT) elT.textContent = '📦 ' + total;
}

function openCoffre(type) {
  state.coffres = state.coffres || { bronze:0, argent:0, or:0, event:0 };
  if ((state.coffres[type] || 0) <= 0) {
    showToast('📦 Tu n\'as pas de coffre ' + type + ' !');
    return;
  }
  state.coffres[type]--;

  let reward = '';
  if (type === 'bronze') {
    const bones = Math.floor(Math.random() * 8000) + 2000;
    state.bones += bones;
    reward = '🦴 +' + fmt(bones) + ' Bones !';
  } else if (type === 'argent') {
    const gems = Math.floor(Math.random() * 30) + 15;
    state.diamonds += gems;
    state.bones += 5000;
    reward = '💎 +' + gems + ' Diamants + 🦴 5K Bones !';
  } else if (type === 'or') {
    const gems = Math.floor(Math.random() * 80) + 50;
    state.diamonds += gems;
    state.bones += 20000;
    state.chanceScore += 100;
    reward = '💎 +' + gems + ' Diamants + 🦴 20K + 🍀 Chance NFT !';
  } else if (type === 'event') {
    state.inventaire = state.inventaire || {};
    state.inventaire.tickets = (state.inventaire.tickets || 0) + 2;
    const gems = Math.floor(Math.random() * 50) + 20;
    state.diamonds += gems;
    reward = '🎫 +2 Tickets + 💎 +' + gems + ' Diamants !';
  }

  showToast('📦 Coffre ouvert ! ' + reward);
  renderCoffresTab();
  renderInventaire();
  updateUI();
  saveState();
}

// ===== INVENTAIRE =====
function renderInventaire() {
  state.inventaire = state.inventaire || { tickets:0, boosts:0, keys:0, fragments:0, luck:0 };
  const inv = state.inventaire;
  const elT  = document.getElementById('invTickets');   if (elT)  elT.textContent  = inv.tickets   || 0;
  const elB  = document.getElementById('invBoosts');    if (elB)  elB.textContent  = inv.boosts    || 0;
  const elK  = document.getElementById('invKeys');      if (elK)  elK.textContent  = inv.keys      || 0;
  const elF  = document.getElementById('invFragments'); if (elF)  elF.textContent  = inv.fragments || 0;
  const elL  = document.getElementById('invLuck');      if (elL)  elL.textContent  = inv.luck      || 0;
  const total = Object.values(inv).reduce((s,v) => s + (v||0), 0);
  const elC  = document.getElementById('inventaireCount'); if (elC) elC.textContent = '🎒 ' + total;
}

// ===== CADEAU QUOTIDIEN =====
function renderDailyGift() {
  const today  = new Date().toDateString();
  const claimed = state.dailyGiftDate === today && state.dailyGiftClaimed;
  const btn    = document.getElementById('dailyGiftBtn');
  const timer  = document.getElementById('dailyGiftTimer');

  if (btn) {
    btn.textContent = claimed ? '✅ Réclamé' : 'RÉCUPÉRER';
    btn.style.opacity = claimed ? '0.5' : '1';
    btn.style.cursor  = claimed ? 'default' : 'pointer';
  }

  if (claimed && timer) {
    const midnight = new Date(); midnight.setHours(24,0,0,0);
    const diff = midnight - Date.now();
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    timer.textContent = h + 'h ' + m + 'm';
  } else if (timer) {
    timer.textContent = 'Disponible !';
  }
}

function claimDailyGift() {
  const today = new Date().toDateString();
  if (state.dailyGiftDate === today && state.dailyGiftClaimed) {
    showToast('🎁 Déjà réclamé aujourd\'hui !');
    return;
  }
  // Récompense quotidienne
  const bones = 5000 + Math.floor(state.streak * 500);
  state.bones += bones;
  state.dailyGiftClaimed = true;
  state.dailyGiftDate    = today;

  showToast('🎁 Cadeau quotidien ! 🦴 +' + fmt(bones) + ' Bones !');
  renderDailyGift();
  updateUI();
  saveState();
}

// ===== BADGE CADEAUX (bouton accueil) =====
function updateCadeauBadge() {
  const today   = new Date().toDateString();
  const giftOk  = !(state.dailyGiftDate === today && state.dailyGiftClaimed);
  const coffres  = state.coffres || {};
  const hasCoffre = Object.values(coffres).some(v => v > 0);
  const badge   = document.getElementById('cadeauBadge');
  if (badge) {
    const count = (giftOk ? 1 : 0) + (hasCoffre ? 1 : 0);
    badge.style.display = count > 0 ? 'flex' : 'none';
    badge.textContent   = count;
  }
}

// ============================================================
// PACKOO — SYSTÈME OFFLINE
// ============================================================

function showOfflinePopup(duree) {
  const earned40  = state._offlineEarned     || 0;
  const earned80  = state._offlineEarned80   || 0;
  const earned100 = state._offlineEarned100  || 0;
  const hasPass   = state.passActivated      || false;

  // Bonus encore à recevoir si pub
  const bonusPub  = earned80  - earned40;   // +40% supplémentaire
  const bonusPass = earned100 - earned40;   // +60% supplémentaire

  // Créer la popup
  const overlay = document.createElement('div');
  overlay.id = 'offlineOverlay';
  overlay.style.cssText = `
    position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:3000;
    display:flex;align-items:center;justify-content:center;padding:20px;
  `;

  overlay.innerHTML = `
    <div style="
      background:linear-gradient(160deg,#1a0a00,#2d1500);
      border:2px solid rgba(245,166,35,0.5);
      border-radius:20px;padding:24px;max-width:340px;width:100%;
      text-align:center;box-shadow:0 8px 40px rgba(245,166,35,0.2);
    ">
      <!-- Icône + titre -->
      <div style="font-size:48px;margin-bottom:8px;">😴</div>
      <div style="font-family:'Fredoka One',cursive;font-size:22px;color:var(--gold);margin-bottom:4px;">
        Absent ${duree}
      </div>
      <div style="font-size:11px;color:var(--text-muted);margin-bottom:20px;">
        Tes chiens ont continué à produire pendant ton absence.
      </div>

      <!-- Tableau 40% / 80% / 100% -->
      <div style="display:flex;gap:6px;margin-bottom:20px;">

        <!-- 40% déjà reçu -->
        <div style="flex:1;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:10px;">
          <div style="font-size:18px;font-weight:900;color:#9D9D9D;">40%</div>
          <div style="font-size:9px;color:var(--text-muted);margin:2px 0;">Récupéré</div>
          <div style="font-size:12px;font-weight:900;color:var(--gold-light);">🦴 ${fmt(earned40)}</div>
          <div style="margin-top:6px;background:#27AE60;border-radius:6px;padding:3px;font-size:9px;font-weight:900;color:white;">✅ REÇU</div>
        </div>

        <!-- 80% avec pub -->
        <div style="flex:1;background:rgba(155,89,182,0.1);border:2px solid rgba(155,89,182,0.4);border-radius:12px;padding:10px;">
          <div style="font-size:18px;font-weight:900;color:#C39BD3;">80%</div>
          <div style="font-size:9px;color:var(--text-muted);margin:2px 0;">Avec pub</div>
          <div style="font-size:12px;font-weight:900;color:var(--gold-light);">🦴 ${fmt(earned80)}</div>
          <div style="margin-top:6px;background:linear-gradient(135deg,#7D3C98,#9B59B6);border-radius:6px;padding:3px;font-size:9px;font-weight:900;color:white;">📺 PUB</div>
        </div>

        <!-- 100% avec pub + pass -->
        <div style="flex:1;background:rgba(245,166,35,0.08);border:2px solid rgba(245,166,35,0.3);border-radius:12px;padding:10px;${hasPass ? '' : 'opacity:0.5;'}">
          <div style="font-size:18px;font-weight:900;color:var(--gold);">100%</div>
          <div style="font-size:9px;color:var(--text-muted);margin:2px 0;">Pub + Pass</div>
          <div style="font-size:12px;font-weight:900;color:var(--gold-light);">🦴 ${fmt(earned100)}</div>
          <div style="margin-top:6px;background:linear-gradient(135deg,var(--gold-dark),var(--gold));border-radius:6px;padding:3px;font-size:9px;font-weight:900;color:#1A0F00;">${hasPass ? '👑 PASS' : '🔒 PASS'}</div>
        </div>

      </div>

      <!-- Bouton pub -->
      <button onclick="collectOfflinePub()" style="
        width:100%;background:linear-gradient(135deg,#7D3C98,#9B59B6);
        border:none;border-radius:14px;padding:14px;
        font-size:14px;font-weight:900;color:white;cursor:pointer;
        font-family:'Nunito',sans-serif;margin-bottom:10px;
      ">
        📺 Regarder une pub — récupérer ${hasPass ? '100%' : '80%'}
      </button>

      <!-- Bouton ignorer -->
      <button onclick="closeOfflinePopup()" style="
        width:100%;background:transparent;
        border:1px solid rgba(255,255,255,0.1);border-radius:14px;padding:10px;
        font-size:12px;font-weight:700;color:var(--text-muted);cursor:pointer;
        font-family:'Nunito',sans-serif;
      ">
        Garder les 40% — continuer
      </button>

    </div>
  `;

  document.body.appendChild(overlay);
}

function collectOfflinePub() {
  const overlay = document.getElementById('offlineOverlay');
  if (overlay) overlay.remove();

  // Simuler la pub (3 secondes)
  showToast('📺 Pub en cours…');
  setTimeout(() => {
    const hasPass    = state.passActivated  || false;
    const full       = state._offlineEarned100 || 0;
    const already    = state._offlineEarned    || 0;
    const target     = hasPass ? full : Math.floor(full * 0.8);
    const bonus      = target - already;

    if (bonus > 0) {
      state.bones += bonus;
      showToast('✅ ' + (hasPass ? '100%' : '80%') + ' récupéré ! 🦴 +' + fmt(bonus) + ' Bones bonus !');
    }

    // Nettoyer
    delete state._offlineEarned;
    delete state._offlineEarned80;
    delete state._offlineEarned100;
    delete state._offlineSeconds;
    delete state._offlineFullProd;

    updateUI();
    saveState();
  }, 3000);
}

function closeOfflinePopup() {
  const overlay = document.getElementById('offlineOverlay');
  if (overlay) overlay.remove();

  // Nettoyer sans donner le bonus
  delete state._offlineEarned;
  delete state._offlineEarned80;
  delete state._offlineEarned100;
  delete state._offlineSeconds;
  delete state._offlineFullProd;

  saveState();
}
