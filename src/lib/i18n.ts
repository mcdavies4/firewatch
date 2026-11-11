/**
 * Alert wording per language. Kept to plain ASCII so texts stay in the cheap
 * 160-character SMS alphabet (no tone marks or hooked letters).
 *
 * The Pidgin, Hausa, Yoruba and Igbo versions are drafts: have a native speaker
 * check them before a real rollout. Edit the strings here; nothing else changes.
 */
export type Lang = "en" | "pcm" | "ha" | "yo" | "ig";

export const LANGS: { code: Lang; label: string }[] = [
  { code: "en", label: "English" },
  { code: "pcm", label: "Pidgin" },
  { code: "ha", label: "Hausa" },
  { code: "yo", label: "Yoruba" },
  { code: "ig", label: "Igbo" },
];

export const asLang = (v: unknown): Lang => (LANGS.some((l) => l.code === v) ? (v as Lang) : "en");

type Words = {
  fire: string;
  co: string;
  panic: string;
  smokeHeat: string;
  at: string;
  adviceCo: string;
  adviceFireHome: string;
  adviceFireMarket: string;
  confirm: string;
  update: string; // "UPDATE"
  responding: (by: string, what: "fire" | "co", where: string) => string;
  button: string;
  reminder: string;
  drill: string;
};

export const WORDS: Record<Lang, Words> = {
  en: {
    fire: "FIRE ALERT",
    co: "CARBON MONOXIDE ALERT",
    panic: "FIRE REPORTED",
    smokeHeat: "smoke/heat",
    at: "at",
    adviceCo: "Get everyone out, open doors and windows, switch off the generator. Do not go back in.",
    adviceFireHome: "Get everyone out and call 112.",
    adviceFireMarket: "Go now.",
    confirm: "Tap to confirm you're responding:",
    update: "UPDATE",
    responding: (by, what, where) => `${by} is responding to the ${what === "co" ? "carbon monoxide" : "fire"} alert at ${where}.`,
    button: "I'M RESPONDING",
    reminder: "STILL NO ONE RESPONDING",
    drill: "DRILL",
  },
  pcm: {
    fire: "FIRE ALERT",
    co: "GAS DANGER (CARBON MONOXIDE)",
    panic: "FIRE DON START",
    smokeHeat: "smoke/heat",
    at: "for",
    adviceCo: "Make everybody comot, open door and window, off the gen. No go back inside.",
    adviceFireHome: "Make everybody comot and call 112.",
    adviceFireMarket: "Go there now now.",
    confirm: "Press this link make dem know say you dey come:",
    update: "UPDATE",
    responding: (by, what, where) => `${by} dey go the ${what === "co" ? "gas" : "fire"} alert for ${where}.`,
    button: "I DEY COME",
    reminder: "NOBODY NEVER RESPOND",
    drill: "DRILL",
  },
  ha: {
    fire: "GARGADIN WUTA",
    co: "HATSARIN ISKA MAI GUBA (CARBON MONOXIDE)",
    panic: "AN BADA RAHOTON WUTA",
    smokeHeat: "hayaki/zafi",
    at: "a",
    adviceCo: "Kowa ya fita, a bude kofofi da tagogi, a kashe janareto. Kada a koma ciki.",
    adviceFireHome: "Kowa ya fita, a kira 112.",
    adviceFireMarket: "Ku je yanzu.",
    confirm: "Danna nan don tabbatar da kana zuwa:",
    update: "SANARWA",
    responding: (by, what, where) => `${by} yana zuwa domin gargadin ${what === "co" ? "iska mai guba" : "wuta"} a ${where}.`,
    button: "INA ZUWA",
    reminder: "BABU WANDA YA AMSA TUKUNA",
    drill: "GWAJI",
  },
  yo: {
    fire: "IKILO INA",
    co: "IKILO EEFIN OLORO (CARBON MONOXIDE)",
    panic: "A TI JABO INA",
    smokeHeat: "eefin/ooru",
    at: "ni",
    adviceCo: "Ki gbogbo eniyan jade, si ilekun ati ferese, pa jenereto. E ma pada wole.",
    adviceFireHome: "Ki gbogbo eniyan jade, ki e pe 112.",
    adviceFireMarket: "E lo nisinsinyi.",
    confirm: "Te ibi yii lati so pe o n bo:",
    update: "IROYIN",
    responding: (by, what, where) => `${by} n lo si ikilo ${what === "co" ? "eefin oloro" : "ina"} ni ${where}.`,
    button: "MO N BO",
    reminder: "KO SI ENIKAN TO DAHUN SIBE",
    drill: "IDANWO",
  },
  ig: {
    fire: "NDUMODU OKU",
    co: "NDUMODU IKUKU NSI (CARBON MONOXIDE)",
    panic: "AKUKO OKU",
    smokeHeat: "anwuru/okpomoku",
    at: "na",
    adviceCo: "Mee ka onye obula puo, meghee uzo na windo, gbanyuo jenereto. Unu alaghachila n'ime.",
    adviceFireHome: "Mee ka onye obula puo ma kpoo 112.",
    adviceFireMarket: "Gaa ugbu a.",
    confirm: "Pia ebe a gosi na i na-abia:",
    update: "OZI",
    responding: (by, what, where) => `${by} na-aga maka ndumodu ${what === "co" ? "ikuku nsi" : "oku"} na ${where}.`,
    button: "A NA M ABIA",
    reminder: "O NWEGHI ONYE ZARALA",
    drill: "NNWALE",
  },
};
