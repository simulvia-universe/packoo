// ============================================================
// PACKOO — DATA.JS
// Toutes les données du jeu : raretés, chiens, coûts, NFT
// ============================================================

const RARITY = {
  COMMON:    { label:'COMMUN',     color:'#9D9D9D', baseProduction:50   },
  UNCOMMON:  { label:'PEU COMMUN', color:'#27AE60', baseProduction:130  },
  RARE:      { label:'RARE',       color:'#3498DB', baseProduction:320  },
  EPIC:      { label:'ÉPIQUE',     color:'#9B59B6', baseProduction:900  },
  LEGENDARY: { label:'LÉGENDAIRE', color:'#E67E22', baseProduction:3000 },
};

const LEVEL_COSTS = {
  COMMON: [
    3097,3269,3441,3613,3785,3957,4129,4301,4473,4645,
    6194,6538,6882,7226,7570,7914,8258,8602,8946,9290,
    12387,13075,13763,14452,15140,15828,16516,17204,17892,18581,
    24774,26151,27527,28903,30280,31656,33032,34409,35785,37161,
    49548,52301,55054,57806,60559,63312,66065,68817,71570,74322
  ],
  UNCOMMON: [
    6452,6810,7168,7527,7885,8244,8602,8961,9319,9677,
    12903,13620,14337,15054,15771,16487,17204,17921,18638,19355,
    25806,27240,28674,30108,31541,32975,34409,35842,37276,38710,
    51613,54480,57348,60215,63082,65950,68817,71685,74552,77419,
    103226,108961,114695,120430,126165,131900,137634,143369,149104,154839
  ],
  RARE: [
    8258,8717,9176,9634,10093,10552,11011,11470,11928,12387,
    16516,17434,18351,19269,20186,21104,22022,22939,23857,24774,
    33032,34867,36703,38538,40373,42208,44043,45878,47713,49548,
    66065,69735,73405,77075,80746,84416,88086,91756,95427,99097,
    132129,139470,146810,154151,161491,168832,176172,183513,190853,198190
  ],
  EPIC: [
    25806,27240,28674,30108,31541,32975,34409,35842,37276,38710,
    51613,54480,57348,60215,63082,65950,68817,71685,74552,77419,
    103226,108961,114695,120430,126165,131900,137634,143369,149104,154839,
    206452,217921,229391,240860,252330,263799,275269,286738,298208,309677,
    412903,435842,458781,481720,504659,527599,550538,573477,596416,619355
  ],
  LEGENDARY: [
    72258,76272,80287,84301,88315,92330,96344,100358,104373,108387,
    144516,152545,160573,168602,176631,184659,192688,200717,208746,216774,
    289032,305090,321147,337204,353262,369319,385376,401434,417491,433548,
    578065,610179,642294,674409,706523,738638,770753,802867,834982,867097,
    1156129,1220358,1284588,1348817,1413047,1477276,1541505,1605735,1669964,1734195
  ],
};

const ALL_DOGS = [
  { id:'paco',   emoji:'🐶', name:'Paco',   rarity:'EPIC',      unlockCost:0,       unlocked:true,  active:true,  level:1, xp:0 },
  { id:'spot',   emoji:'🐩', name:'Spot',   rarity:'COMMON',    unlockCost:500,     unlocked:false, active:false, level:1, xp:0 },
  { id:'buddy',  emoji:'🐕', name:'Buddy',  rarity:'COMMON',    unlockCost:1000,    unlocked:false, active:false, level:1, xp:0 },
  { id:'bella',  emoji:'🐕', name:'Bella',  rarity:'COMMON',    unlockCost:2000,    unlocked:false, active:false, level:1, xp:0 },
  { id:'coco',   emoji:'🦴', name:'Coco',   rarity:'COMMON',    unlockCost:3500,    unlocked:false, active:false, level:1, xp:0 },
  { id:'moka',   emoji:'🐕', name:'Moka',   rarity:'COMMON',    unlockCost:5000,    unlocked:false, active:false, level:1, xp:0 },
  { id:'rex',    emoji:'🦮', name:'Rex',    rarity:'UNCOMMON',  unlockCost:10000,   unlocked:false, active:false, level:1, xp:0 },
  { id:'thor',   emoji:'🐕', name:'Thor',   rarity:'UNCOMMON',  unlockCost:15000,   unlocked:false, active:false, level:1, xp:0 },
  { id:'zeus',   emoji:'🐕', name:'Zeus',   rarity:'UNCOMMON',  unlockCost:25000,   unlocked:false, active:false, level:1, xp:0 },
  { id:'nala',   emoji:'🦴', name:'Nala',   rarity:'UNCOMMON',  unlockCost:35000,   unlocked:false, active:false, level:1, xp:0 },
  { id:'duke',   emoji:'🐕', name:'Duke',   rarity:'UNCOMMON',  unlockCost:45000,   unlocked:false, active:false, level:1, xp:0 },
  { id:'milo',   emoji:'🐶', name:'Milo',   rarity:'UNCOMMON',  unlockCost:50000,   unlocked:false, active:false, level:1, xp:0 },
  { id:'rocky',  emoji:'🦮', name:'Rocky',  rarity:'RARE',      unlockCost:100000,  unlocked:false, active:false, level:1, xp:0 },
  { id:'max',    emoji:'🐕', name:'Max',    rarity:'RARE',      unlockCost:150000,  unlocked:false, active:false, level:1, xp:0 },
  { id:'atlas',  emoji:'🦮', name:'Atlas',  rarity:'RARE',      unlockCost:200000,  unlocked:false, active:false, level:1, xp:0 },
  { id:'titan',  emoji:'🐕', name:'Titan',  rarity:'RARE',      unlockCost:300000,  unlocked:false, active:false, level:1, xp:0 },
  { id:'storm',  emoji:'🌊', name:'Storm',  rarity:'RARE',      unlockCost:300000,  unlocked:false, active:false, level:1, xp:0 },
  { id:'king',   emoji:'👑', name:'King',   rarity:'EPIC',      unlockCost:500000,  unlocked:false, active:false, level:1, xp:0 },
  { id:'shadow', emoji:'🌑', name:'Shadow', rarity:'EPIC',      unlockCost:1000000, unlocked:false, active:false, level:1, xp:0 },
  { id:'blaze',  emoji:'🔥', name:'Blaze',  rarity:'EPIC',      unlockCost:1500000, unlocked:false, active:false, level:1, xp:0 },
  { id:'luna',   emoji:'🌙', name:'Luna',   rarity:'LEGENDARY', unlockCost:null,    unlocked:false, active:false, level:1, xp:0 },
];

const MAX_LEVEL  = 50;
const MAX_ACTIVE = 6;

const NFT_POOLS = {
  SEASONAL: [
    { name:'Flame Paco #042',      rarity:'🟣 Épique · Saisonnier',     pityKey:'EPIC',      chance:0.003  },
    { name:'Ocean Buddy #156',     rarity:'🔵 Rare · Saisonnier',       pityKey:'RARE',      chance:0.007  },
    { name:'Forest Nala #203',     rarity:'🔵 Rare · Saisonnier',       pityKey:'RARE',      chance:0.007  },
    { name:'Storm Rocky #018',     rarity:'🟣 Épique · Saisonnier',     pityKey:'EPIC',      chance:0.003  },
    { name:'Clover Spot #312',     rarity:'🟢 Peu Commun · Saisonnier', pityKey:'UNCOMMON',  chance:0.01   },
  ],
  THEMATIC: [
    { name:'Phantom Mask #T01',    rarity:'🔵 Rare · Thématique',       pityKey:'RARE',      chance:0.002  },
    { name:'Halloween Bully #T05', rarity:'🟣 Épique · Thématique',     pityKey:'EPIC',      chance:0.001  },
  ],
  GENESIS: [
    { name:'Alpha Paco #001',      rarity:'🟠 Légendaire · Genesis',    pityKey:'LEGENDARY', chance:0.0001 },
    { name:'Moonlight Luna #012',  rarity:'🟠 Légendaire · Genesis',    pityKey:'LEGENDARY', chance:0.0001 },
    { name:'Snow Paco #003',       rarity:'🟠 Légendaire · Genesis',    pityKey:'LEGENDARY', chance:0.0001 },
  ],
};

const PITY_LIMITS = {
  COMMON:100, UNCOMMON:300, RARE:600, EPIC:1500, LEGENDARY:5000
};
