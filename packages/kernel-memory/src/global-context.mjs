const TIERS = Object.freeze(["certified", "supported", "best_effort"]);
const KEYS = new Set(["language","locale","market","country","timezone","currency","regulatoryRegion","languageTier"]);

const freeze = (v) => Object.freeze(v);
const str = (v,n,m=64) => {
  if (typeof v !== "string" || !v.trim()) throw new TypeError(`${n} required`);
  const s=v.trim(); if(s.length>m) throw new Error(`${n} too long`); return s;
};
const up = (v,n,min,max=min) => {
  const s=str(v,n,max).toUpperCase();
  if(!new RegExp(`^[A-Z0-9-]{${min},${max}}$`).test(s)) throw new Error(`${n} invalid`);
  return s;
};

export function createGlobalContextV1(input={}) {
  if(!input || typeof input!=="object" || Array.isArray(input)) throw new TypeError,"globalContext must be an object");
  for(const k of Object.keys(input)) if(!KEYS.has(k)) throw new Error(`globalContext unsupported field: ${k}`);

  const language=str(input.language,"language",35).toLowerCase();
  if(!/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/.test(language)) throw new Error("language invalid");

  const rawLocale=str(input.locale,"locale",35);
  if(!/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})+$/.test(rawLocale)) throw new Error("locale invalid");
  const p=rawLocale.split("-");
  const locale=[p[0].toLowerCase(),...p.slice(1).map((x,i,a)=>i===a.length-1&&/^[A-Za-z]{2}$/.test(x)?x.toUpperCase():x)].join("-");

  const languageTier=str(input.languageTier,"languageTier",32).toLowerCase();
  if(!TIERS.includes(languageTier)) throw new Error("languageTier invalid");

  return freeze({
    schemaVersion:1, language, locale,
    market:up(input.market,"market",2,12),
    country:up(input.country,"country",2),
    timezone:str(input.timezone,"timezone"),
    currency:up(input.currency,"currency",3),
    regulatoryRegion:str(input.regulatoryRegion,"regulatoryRegion"),
    languageTier,
  });
}

export const languageTiersV1 = TIERS;
