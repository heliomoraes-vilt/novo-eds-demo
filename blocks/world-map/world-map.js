import { readBlockConfig } from '../../scripts/aem.js';
import {
  cityCoord, filtered, getState, label, loadCatalog, primaryCity, setState, subscribe,
} from '../../scripts/catalog-state.js';

/*
 * Mapa-múndi interativo: Mundo → país → cidade.
 *
 * A geometria (172 países) não vive no HTML como no site legado: é um SVG carregado sob
 * demanda de blocks/world-map/world.svg, projetado em equirretangular sobre um viewBox
 * 0 0 1000 500. A seleção vai para scripts/catalog-state.js, então clicar num país filtra
 * o catálogo e os gráficos sem que este bloco conheça os outros.
 *
 * Autoria:
 *   | World map |
 *   | source   | /parcerias.json                     |
 *   | title    | Explore nossos parceiros pelo mundo |
 *   | subtitle | Selecione um país para explorar...  |
 */

const VIEW = { w: 1000, h: 500 };
const SCALE = { min: 1, max: 12, step: 1.6 };
const ALIASES = { 'United States of America': 'United States' };

const TEXT = {
  pt: {
    world: 'Mundo',
    trail: 'Mundo → país → cidade',
    clear: 'Limpar localização',
    legend: 'Número de instituições',
    legendCity: 'Instituições por cidade',
    zoomIn: 'Aproximar mapa',
    zoomOut: 'Afastar mapa',
    reset: 'Limpar filtro do mapa',
    selectedCountry: 'País selecionado',
    selectedCity: 'Cidade selecionada',
    universities: 'universidades',
    cities: 'cidades',
    opportunities: 'tipos de oportunidade',
    topCities: 'Principais cidades',
    pickCountry: 'Selecione um país para ver as cidades.',
    mapTitle: 'Mapa das instituições parceiras',
    mapDesc: 'Países com parceria destacados em vermelho, com a contagem de instituições.',
    error: 'Não foi possível carregar o mapa.',
    summary: (u, c) => `${u} universidades · ${c} cidades`,
  },
  en: {
    world: 'World',
    trail: 'World → country → city',
    clear: 'Clear location',
    legend: 'Number of institutions',
    legendCity: 'Institutions per city',
    zoomIn: 'Zoom in map',
    zoomOut: 'Zoom out map',
    reset: 'Clear map filter',
    selectedCountry: 'Selected country',
    selectedCity: 'Selected city',
    universities: 'universities',
    cities: 'cities',
    opportunities: 'opportunity types',
    topCities: 'Top cities',
    pickCountry: 'Select a country to see its cities.',
    mapTitle: 'Map of partner institutions',
    mapDesc: 'Partner countries highlighted in red, with the institution count.',
    error: 'The map could not be loaded.',
    summary: (u, c) => `${u} universities · ${c} cities`,
  },
};

const lang = () => ((document.documentElement.lang || 'pt').slice(0, 2) === 'en' ? 'en' : 'pt');
const t = (key) => TEXT[lang()][key];

const SVG_NS = 'http://www.w3.org/2000/svg';
const svgEl = (name, attrs = {}) => {
  const node = document.createElementNS(SVG_NS, name);
  Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
  return node;
};
const el = (tagName, className, text) => {
  const node = document.createElement(tagName);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

/** Equirretangular: a mesma projeção usada para desenhar world.svg. */
const project = (lat, lon) => ({
  x: ((Number(lon) + 180) / 360) * VIEW.w,
  y: ((90 - Number(lat)) / 180) * VIEW.h,
});

/** Faixas de intensidade do coroplético, do site legado. */
function colorForCount(n, max) {
  if (!n) return '';
  const r = max ? n / max : 0;
  if (r > 0.7) return 'var(--map-5)';
  if (r > 0.38) return 'var(--map-4)';
  if (r > 0.18) return 'var(--map-3)';
  if (r > 0.07) return 'var(--map-2)';
  return 'var(--map-1)';
}

export default async function decorate(block) {
  const config = readBlockConfig(block);
  const source = config.source || '/parcerias.json';
  const geometry = config.geometry
    || `${window.hlx.codeBasePath}/blocks/world-map/world.svg`;

  block.textContent = '';
  const status = el('p', 'map-status', '');
  status.setAttribute('role', 'status');

  let geometryDoc;
  try {
    const [, svgText] = await Promise.all([
      loadCatalog(source),
      fetch(geometry).then((r) => {
        if (!r.ok) throw new Error(`${r.status} ao carregar ${geometry}`);
        return r.text();
      }),
    ]);
    geometryDoc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  } catch (e) {
    status.textContent = t('error');
    block.append(status);
    // eslint-disable-next-line no-console
    console.error('world-map', e);
    return;
  }

  /* ---------- estrutura ---------- */
  const head = el('div', 'map-head');
  const headText = el('div');
  if (config.title) headText.append(el('h3', 'map-title', config.title));
  if (config.subtitle) headText.append(el('p', 'map-subtitle', config.subtitle));
  const clearButton = el('button', 'map-clear', t('clear'));
  clearButton.type = 'button';
  clearButton.hidden = true;
  head.append(headText, clearButton);

  const breadcrumb = el('nav', 'map-breadcrumb');
  breadcrumb.setAttribute('aria-label', t('trail'));
  const trailNote = el('span', 'map-trail-note', t('trail'));
  const breadcrumbBar = el('div', 'map-breadcrumb-bar');
  breadcrumbBar.append(breadcrumb, trailNote);

  const wrap = el('div', 'map-wrap');
  const svg = svgEl('svg', {
    viewBox: `0 0 ${VIEW.w} ${VIEW.h}`,
    role: 'img',
    'aria-labelledby': 'map-title-svg map-desc-svg',
  });
  const svgTitle = svgEl('title', { id: 'map-title-svg' });
  svgTitle.textContent = t('mapTitle');
  const svgDesc = svgEl('desc', { id: 'map-desc-svg' });
  svgDesc.textContent = t('mapDesc');

  const grid = svgEl('g', { class: 'map-grid' });
  [0.25, 0.5, 0.75].forEach((r) => {
    grid.append(svgEl('line', {
      x1: 0, y1: VIEW.h * r, x2: VIEW.w, y2: VIEW.h * r,
    }));
    grid.append(svgEl('line', {
      x1: VIEW.w * r, y1: 0, x2: VIEW.w * r, y2: VIEW.h,
    }));
  });

  const viewport = svgEl('g', { class: 'map-viewport' });
  const countries = svgEl('g', { class: 'map-countries' });
  const markers = svgEl('g', { class: 'map-markers' });
  viewport.append(countries, markers);
  svg.append(svgTitle, svgDesc, grid, viewport);

  const shapes = new Map();
  [...geometryDoc.querySelectorAll('path[data-name]')].forEach((node) => {
    const raw = node.getAttribute('data-name');
    const name = ALIASES[raw] || raw;
    const shape = svgEl('path', {
      class: 'map-country', d: node.getAttribute('d'), 'vector-effect': 'non-scaling-stroke',
    });
    shape.dataset.country = name;
    countries.append(shape);
    if (!shapes.has(name)) shapes.set(name, []);
    shapes.get(name).push(shape);
  });

  const controls = el('div', 'map-controls');
  const zoomIn = el('button', 'map-control', '+');
  const zoomOut = el('button', 'map-control', '−');
  const resetButton = el('button', 'map-control', '↺');
  [[zoomIn, 'zoomIn'], [zoomOut, 'zoomOut'], [resetButton, 'reset']].forEach(([b, key]) => {
    b.type = 'button';
    b.setAttribute('aria-label', t(key));
  });
  controls.append(zoomIn, zoomOut, resetButton);

  const legend = el('div', 'map-legend');
  const legendText = el('span', 'map-legend-text', t('legend'));
  const legendScale = el('div', 'map-legend-scale');
  [1, 2, 3, 4, 5].forEach((i) => {
    const swatch = el('i');
    swatch.style.backgroundColor = `var(--map-${i})`;
    legendScale.append(swatch);
  });
  legend.append(legendText, legendScale);

  const selection = el('div', 'map-selection');
  selection.hidden = true;
  const selectionEyebrow = el('span', 'map-selection-eyebrow');
  const selectionTitle = el('strong');
  const selectionMeta = el('span', 'map-selection-meta');
  selection.append(selectionEyebrow, selectionTitle, selectionMeta);

  const tooltip = el('div', 'map-tooltip');
  tooltip.hidden = true;
  wrap.append(svg, controls, legend, selection, tooltip);

  const foot = el('div', 'map-foot');
  const metrics = el('div', 'map-metrics');
  const metricValues = {};
  [['universities', t('universities')], ['cities', t('cities')],
    ['opportunities', t('opportunities')]].forEach(([key, text]) => {
    const item = el('div', 'map-metric');
    const value = el('strong', null, '0');
    item.append(value, el('span', null, text));
    metricValues[key] = value;
    metrics.append(item);
  });
  const cityStrip = el('div', 'map-city-strip');
  const cityStripLabel = el('span', 'map-city-strip-label', t('topCities'));
  const cityChips = el('div', 'map-city-chips');
  cityStrip.append(cityStripLabel, cityChips);
  foot.append(metrics, cityStrip);

  block.append(head, breadcrumbBar, wrap, foot);

  /* ---------- zoom e pan ---------- */
  let scale = 1;
  let tx = 0;
  let ty = 0;

  /*
   * Os marcadores moram dentro do grupo que recebe o zoom, então a posição acompanha o
   * mapa mas o tamanho não pode: cada um leva a escala inversa para continuar legível.
   */
  function syncMarkerScale() {
    markers.querySelectorAll('.map-marker').forEach((group) => {
      const { x, y } = group.dataset;
      group.setAttribute('transform', `translate(${x} ${y}) scale(${1 / scale})`);
    });
  }

  function applyTransform() {
    viewport.setAttribute('transform', `translate(${tx} ${ty}) scale(${scale})`);
    svg.classList.toggle('is-zoomed', scale > 1);
    syncMarkerScale();
  }

  function clampPan() {
    const limitX = VIEW.w * (scale - 1);
    const limitY = VIEW.h * (scale - 1);
    tx = Math.min(0, Math.max(-limitX, tx));
    ty = Math.min(0, Math.max(-limitY, ty));
  }

  function zoomBy(factor) {
    const next = Math.min(SCALE.max, Math.max(SCALE.min, scale * factor));
    const cx = VIEW.w / 2;
    const cy = VIEW.h / 2;
    tx = cx - ((cx - tx) / scale) * next;
    ty = cy - ((cy - ty) / scale) * next;
    scale = next;
    clampPan();
    applyTransform();
  }

  function resetView() {
    scale = 1;
    tx = 0;
    ty = 0;
    applyTransform();
  }

  function zoomToCountry(country) {
    const parts = shapes.get(country);
    if (!parts || !parts.length) return;
    const boxes = parts.map((p) => p.getBBox());
    const minX = Math.min(...boxes.map((b) => b.x));
    const minY = Math.min(...boxes.map((b) => b.y));
    const maxX = Math.max(...boxes.map((b) => b.x + b.width));
    const maxY = Math.max(...boxes.map((b) => b.y + b.height));
    const w = Math.max(maxX - minX, 1);
    const h = Math.max(maxY - minY, 1);
    scale = Math.min(SCALE.max, Math.max(1, Math.min((VIEW.w / w) * 0.55, (VIEW.h / h) * 0.55)));
    tx = VIEW.w / 2 - ((minX + maxX) / 2) * scale;
    ty = VIEW.h / 2 - ((minY + maxY) / 2) * scale;
    clampPan();
    applyTransform();
  }

  zoomIn.addEventListener('click', () => zoomBy(SCALE.step));
  zoomOut.addEventListener('click', () => zoomBy(1 / SCALE.step));
  resetButton.addEventListener('click', () => {
    resetView();
    setState({ continent: getState().continent, country: '', city: '' });
  });

  let dragging = null;
  svg.addEventListener('pointerdown', (event) => {
    if (scale === 1) return;
    dragging = { x: event.clientX, y: event.clientY, moved: false };
    svg.setPointerCapture(event.pointerId);
  });
  svg.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    const rect = svg.getBoundingClientRect();
    const ratio = VIEW.w / rect.width;
    tx += (event.clientX - dragging.x) * ratio;
    ty += (event.clientY - dragging.y) * ratio;
    dragging.x = event.clientX;
    dragging.y = event.clientY;
    dragging.moved = true;
    clampPan();
    applyTransform();
  });
  const endDrag = () => {
    dragging = null;
  };
  svg.addEventListener('pointerup', endDrag);
  svg.addEventListener('pointercancel', endDrag);

  /* ---------- tooltip ---------- */
  function showTooltip(text, event) {
    tooltip.textContent = text;
    tooltip.hidden = false;
    const rect = wrap.getBoundingClientRect();
    tooltip.style.left = `${event.clientX - rect.left}px`;
    tooltip.style.top = `${event.clientY - rect.top}px`;
  }
  const hideTooltip = () => {
    tooltip.hidden = true;
  };
  wrap.addEventListener('pointerleave', hideTooltip);

  /* ---------- marcadores ---------- */
  function marker({
    x, y, count, text, onPick,
  }) {
    const group = svgEl('g', {
      class: 'map-marker', role: 'button', tabindex: '0', 'aria-label': `${text}: ${count}`,
    });
    group.dataset.x = x;
    group.dataset.y = y;
    group.setAttribute('transform', `translate(${x} ${y}) scale(${1 / scale})`);
    const r = Math.min(16, 7 + Math.log2(count + 1) * 2.2);
    group.append(svgEl('circle', { r, 'vector-effect': 'non-scaling-stroke' }));
    const value = svgEl('text', { class: 'map-marker-count', y: '0.5' });
    value.textContent = count;
    group.append(value);
    const pick = () => onPick();
    group.addEventListener('click', (event) => {
      if (dragging && dragging.moved) return;
      event.stopPropagation();
      pick();
    });
    group.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        pick();
      }
    });
    group.addEventListener('pointerenter', (event) => showTooltip(`${text}: ${count}`, event));
    group.addEventListener('pointerleave', hideTooltip);
    return group;
  }

  /* ---------- render ---------- */
  function renderBreadcrumb() {
    const { country, city } = getState();
    breadcrumb.textContent = '';
    const worldStep = el('button', 'map-step', t('world'));
    worldStep.type = 'button';
    worldStep.addEventListener('click', () => {
      resetView();
      setState({ country: '', city: '' });
    });
    breadcrumb.append(worldStep);
    if (country) {
      breadcrumb.append(el('span', 'map-sep', '›'));
      if (city) {
        const countryStep = el('button', 'map-step', label('pais', country));
        countryStep.type = 'button';
        countryStep.addEventListener('click', () => setState({ city: '' }));
        const cityStep = el('span', 'map-step map-step-current', city);
        breadcrumb.append(countryStep, el('span', 'map-sep', '›'), cityStep);
      } else {
        breadcrumb.append(el('span', 'map-step map-step-current', label('pais', country)));
      }
    }
  }

  function renderShapes() {
    const perCountry = new Map();
    filtered('country').forEach((p) => {
      perCountry.set(p.country, (perCountry.get(p.country) || 0) + 1);
    });
    const max = Math.max(1, ...perCountry.values());
    const { country } = getState();

    shapes.forEach((parts, name) => {
      const count = perCountry.get(name) || 0;
      const fill = colorForCount(count, max);
      parts.forEach((shape) => {
        shape.style.fill = fill || '';
        shape.classList.toggle('has-partners', count > 0);
        shape.classList.toggle('is-selected', !!country && country === name);
        if (count > 0) {
          shape.setAttribute('role', 'button');
          shape.setAttribute('tabindex', '0');
          shape.setAttribute('aria-label', `${label('pais', name)}: ${count}`);
        } else {
          shape.removeAttribute('role');
          shape.removeAttribute('tabindex');
          shape.removeAttribute('aria-label');
        }
      });
    });
    return perCountry;
  }

  function pickCountry(name) {
    const { country } = getState();
    if (country === name) {
      resetView();
      setState({ country: '', city: '' });
    } else {
      setState({ country: name, city: '' });
      zoomToCountry(name);
    }
  }

  function renderMarkers(perCountry) {
    markers.textContent = '';
    const { country } = getState();

    if (!country) {
      const seen = new Map();
      filtered('country').forEach((p) => {
        if (!seen.has(p.country) && Number.isFinite(p.lat) && Number.isFinite(p.lon)) {
          seen.set(p.country, project(p.lat, p.lon));
        }
      });
      seen.forEach((point, name) => {
        markers.append(marker({
          x: point.x,
          y: point.y,
          count: perCountry.get(name) || 0,
          text: label('pais', name),
          onPick: () => pickCountry(name),
        }));
      });
      return;
    }

    const perCity = new Map();
    filtered('city').filter((p) => p.country === country).forEach((p) => {
      const name = primaryCity(p);
      if (name) perCity.set(name, (perCity.get(name) || 0) + 1);
    });
    perCity.forEach((count, name) => {
      const coord = cityCoord(country, name);
      if (!coord) return;
      const point = project(coord.lat, coord.lon);
      const group = marker({
        x: point.x,
        y: point.y,
        count,
        text: name,
        onPick: () => setState({ city: getState().city === name ? '' : name }),
      });
      group.classList.add('map-marker-city');
      if (getState().city === name) group.classList.add('is-selected');
      const caption = svgEl('text', { class: 'map-marker-name', x: '14', y: '0.5' });
      caption.textContent = name;
      group.append(caption);
      markers.append(group);
    });
  }

  function renderSummary() {
    const { country, city } = getState();
    const rows = filtered();
    metricValues.universities.textContent = rows.length;
    metricValues.cities.textContent = new Set(rows.map(primaryCity).filter(Boolean)).size;
    metricValues.opportunities.textContent = new Set(rows.flatMap((p) => p.categories)).size;

    legendText.textContent = country ? t('legendCity') : t('legend');
    clearButton.hidden = !country && !city;

    if (country) {
      const inCountry = filtered('city').filter((p) => p.country === country);
      selection.hidden = false;
      selectionEyebrow.textContent = city ? t('selectedCity') : t('selectedCountry');
      selectionTitle.textContent = city || label('pais', country);
      selectionMeta.textContent = t('summary')(
        city ? rows.length : inCountry.length,
        new Set(inCountry.map(primaryCity).filter(Boolean)).size,
      );
    } else {
      selection.hidden = true;
    }

    cityChips.textContent = '';
    if (!country) {
      cityChips.append(el('span', 'map-city-empty', t('pickCountry')));
      return;
    }
    const perCity = new Map();
    filtered('city').filter((p) => p.country === country).forEach((p) => {
      const name = primaryCity(p);
      if (name) perCity.set(name, (perCity.get(name) || 0) + 1);
    });
    [...perCity.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .forEach(([name, count]) => {
        const chip = el('button', 'map-city-chip');
        chip.type = 'button';
        chip.setAttribute('aria-pressed', String(getState().city === name));
        chip.append(el('span', 'map-city-name', name), el('span', 'map-city-count', String(count)));
        chip.addEventListener('click', () => {
          setState({ city: getState().city === name ? '' : name });
        });
        cityChips.append(chip);
      });
  }

  function render() {
    const perCountry = renderShapes();
    renderMarkers(perCountry);
    renderBreadcrumb();
    renderSummary();
  }

  countries.addEventListener('click', (event) => {
    const shape = event.target.closest('.map-country.has-partners');
    if (!shape || (dragging && dragging.moved)) return;
    pickCountry(shape.dataset.country);
  });
  countries.addEventListener('keydown', (event) => {
    const shape = event.target.closest('.map-country.has-partners');
    if (!shape) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      pickCountry(shape.dataset.country);
    }
  });
  countries.addEventListener('pointerover', (event) => {
    const shape = event.target.closest('.map-country.has-partners');
    if (shape) showTooltip(shape.getAttribute('aria-label'), event);
  });

  clearButton.addEventListener('click', () => {
    resetView();
    setState({ country: '', city: '' });
  });

  subscribe(() => {
    if (!getState().country && scale > 1) resetView();
    render();
  });
  render();
}
