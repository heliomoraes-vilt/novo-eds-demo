/*
 * Estado compartilhado do catálogo de parcerias.
 *
 * Os blocos partner-catalog, network-insights (e, na onda 3, world-map) são blocos
 * independentes que carregam fora de ordem. Em vez de um importar o outro — o projeto
 * só permite import cruzado de fragment.js — todos assinam este módulo: quem mexe nos
 * filtros chama setState, e os demais se redesenham ao serem notificados.
 */

const DEFAULT_SOURCE = '/parcerias.json';
export const ACCREDITATIONS = ['AACSB', 'AMBA', 'EQUIS', 'ABET'];
export const SORTS = ['az', 'country', 'founded'];

const state = {
  q: '',
  continent: '',
  country: '',
  city: '',
  courses: new Set(),
  category: '',
  accreditations: new Set(),
  sort: 'az',
};

const listeners = new Set();
let partners = [];
let labels = {};
let cities = {};
let loading = null;

const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const toList = (v) => String(v ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const toBool = (v) => String(v ?? '').trim().toLowerCase() === 'true';
const uniq = (a) => [...new Set(a.filter(Boolean))];

/** Idioma corrente da página, definido em scripts.js a partir do path. */
const lang = () => ((document.documentElement.lang || 'pt').slice(0, 2) === 'en' ? 'en' : 'pt');

/**
 * Rótulo traduzido de um termo da taxonomia.
 * @param {string} kind curso, oportunidade, continente, pais ou acreditacao
 * @param {string} key chave do termo
 * @returns {string} rótulo no idioma da página, ou a própria chave
 */
export function label(kind, key) {
  const entry = labels[kind] && labels[kind][key];
  return (entry && entry[lang()]) || key;
}

/** Primeira cidade de um registro que lista mais de uma. */
export const primaryCity = (p) => String(p.city || '').split(/\s+e\s+|\/|,/i)[0].trim();

/**
 * Coordenadas de uma cidade, da aba `cidades` da planilha.
 * @param {string} country país, na chave em inglês
 * @param {string} city nome da cidade
 * @returns {{lat: number, lon: number}|null} coordenadas, ou null se a cidade não estiver lá
 */
export const cityCoord = (country, city) => cities[`${country}|${city}`] || null;

function normalizePartner(row) {
  return {
    slug: row.slug,
    institution: row.institution,
    continent: row.continent,
    country: row.country,
    city: row.city || '',
    campuses: row.campuses || '',
    population: Number(row.population) || 0,
    founded: Number(row.founded) || 0,
    website: row.website || '',
    degree: row.degree || '',
    courses: toList(row.courses),
    partnerships: toList(row.partnerships),
    programs: toList(row.programs),
    categories: toList(row.categories),
    accreditations: ACCREDITATIONS.filter((a) => toBool(row[a.toLowerCase()])),
    photo: row.photo || '',
    logo: row.logo || '',
    lat: Number(row.lat),
    lon: Number(row.lon),
  };
}

function indexLabels(rows) {
  const out = {};
  rows.forEach((row) => {
    if (!row.tipo || !row.chave) return;
    if (!out[row.tipo]) out[row.tipo] = {};
    out[row.tipo][row.chave] = { pt: row.pt || row.chave, en: row.en || row.chave };
  });
  return out;
}

/**
 * Carrega a planilha publicada. Chamadas simultâneas compartilham a mesma requisição,
 * então cada bloco pode chamar sem coordenar com os outros.
 * @param {string} source caminho do índice publicado
 * @returns {Promise<Array>} registros normalizados
 */
export function loadCatalog(source = DEFAULT_SOURCE) {
  if (!loading) {
    loading = fetch(source)
      .then((resp) => {
        if (!resp.ok) throw new Error(`${resp.status} ao carregar ${source}`);
        return resp.json();
      })
      .then((json) => {
        const sheet = json.parceiros || json;
        partners = (sheet.data || []).map(normalizePartner);
        labels = indexLabels((json.taxonomia && json.taxonomia.data) || []);
        cities = {};
        ((json.cidades && json.cidades.data) || []).forEach((row) => {
          cities[`${row.pais}|${row.cidade}`] = { lat: Number(row.lat), lon: Number(row.lon) };
        });
        return partners;
      });
  }
  return loading;
}

export const getPartners = () => partners;
export const getState = () => state;

/**
 * Decide se um registro passa pelos filtros ativos.
 * @param {object} p registro normalizado
 * @param {string} ignore nome de um filtro a desconsiderar, para contagens por faceta
 * @returns {boolean} true quando o registro entra no recorte
 */
export function matches(p, ignore = '') {
  const q = norm(state.q.trim());
  if (q) {
    const hay = norm([
      p.institution, p.country, label('pais', p.country), p.city, p.campuses, p.degree,
      ...p.courses, ...p.courses.map((c) => label('curso', c)),
      ...p.partnerships, ...p.programs,
      ...p.categories.map((c) => label('oportunidade', c)),
    ].join(' '));
    if (!hay.includes(q)) return false;
  }
  if (ignore !== 'continent' && state.continent && p.continent !== state.continent) return false;
  if (ignore !== 'country' && state.country && p.country !== state.country) return false;
  if (ignore !== 'city' && state.city && primaryCity(p) !== state.city) return false;
  if (ignore !== 'courses' && state.courses.size
    && ![...state.courses].every((c) => p.courses.includes(c))) return false;
  if (ignore !== 'category' && state.category
    && !p.categories.includes(state.category)) return false;
  if (ignore !== 'accreditations' && state.accreditations.size
    && ![...state.accreditations].every((a) => p.accreditations.includes(a))) return false;
  return true;
}

export const filtered = (ignore = '') => partners.filter((p) => matches(p, ignore));

function sorted(rows) {
  const collator = new Intl.Collator(lang());
  return rows.slice().sort((x, y) => {
    if (state.sort === 'country') {
      return collator.compare(label('pais', x.country), label('pais', y.country))
        || collator.compare(x.institution, y.institution);
    }
    if (state.sort === 'founded') {
      return (x.founded || Infinity) - (y.founded || Infinity)
        || collator.compare(x.institution, y.institution);
    }
    return collator.compare(x.institution, y.institution);
  });
}

/** Registros do recorte atual, já ordenados. */
export const getResults = () => sorted(filtered());

/**
 * Contagem por dimensão dentro do recorte atual, desconsiderando o próprio filtro
 * daquela dimensão — é assim que os gráficos continuam mostrando as outras opções.
 * @param {string} dimension continent, category ou course
 * @returns {Map<string, number>} chave para contagem, da maior para a menor
 */
export function countBy(dimension) {
  const rows = filtered(dimension === 'course' ? 'courses' : dimension);
  const counts = new Map();
  const add = (key) => counts.set(key, (counts.get(key) || 0) + 1);
  rows.forEach((p) => {
    if (dimension === 'continent') add(p.continent);
    else if (dimension === 'category') p.categories.forEach(add);
    else if (dimension === 'course') p.courses.forEach(add);
  });
  return new Map([...counts.entries()].sort((a, b) => b[1] - a[1]));
}

/** Valores distintos de um campo em toda a base, para montar os seletores. */
export const optionsFor = (field) => uniq(partners.map((p) => p[field]));

function notify() {
  listeners.forEach((fn) => {
    try {
      fn(state);
    } catch (e) {
      // um bloco com problema não pode impedir os outros de atualizar
      // eslint-disable-next-line no-console
      console.error('catalog-state listener failed', e);
    }
  });
}

/**
 * Aplica mudanças no estado e avisa todos os blocos inscritos.
 * @param {object} patch campos a alterar; Sets substituem o valor inteiro
 */
export function setState(patch) {
  Object.entries(patch).forEach(([key, value]) => {
    if (!(key in state)) return;
    if (state[key] instanceof Set) state[key] = new Set(value);
    else state[key] = value;
  });
  if (patch.continent !== undefined && !patch.country) state.country = '';
  if (patch.country !== undefined) state.city = '';
  notify();
}

export function clearFilters() {
  setState({
    q: '', continent: '', country: '', city: '', courses: [], category: '', accreditations: [],
  });
}

/**
 * Inscreve um bloco nas mudanças de estado.
 * @param {Function} fn chamada a cada mudança
 * @returns {Function} cancela a inscrição
 */
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
