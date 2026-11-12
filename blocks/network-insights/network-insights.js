import { readBlockConfig } from '../../scripts/aem.js';
import {
  countBy, getState, label, loadCatalog, setState, subscribe,
} from '../../scripts/catalog-state.js';

/*
 * Visão da rede: leitura agregada do mesmo recorte que o partner-catalog mostra.
 * Cada barra é um botão que aplica o filtro correspondente, via scripts/catalog-state.js.
 *
 * Autoria — uma linha por painel, na ordem desejada:
 *   | Network insights |
 *   | source    | /parcerias.json          |
 *   | continent | Distribuição por região  |
 *   | category  | Oportunidades            |
 *   | course    | Cursos com mais opções   |
 */

const DIMENSIONS = {
  continent: { taxonomy: 'continente', state: 'continent' },
  category: { taxonomy: 'oportunidade', state: 'category' },
  course: { taxonomy: 'curso', state: 'courses' },
};

const TEXT = {
  pt: {
    continent: 'Selecione uma barra para filtrar.',
    category: 'Tipos de experiência no recorte atual.',
    course: 'Compatibilidade indicada na base institucional.',
    empty: 'Nada a mostrar no recorte atual.',
    error: 'Não foi possível carregar os dados da rede.',
  },
  en: {
    continent: 'Select a bar to filter.',
    category: 'Experience types in the current selection.',
    course: 'Compatibility stated in the institutional base.',
    empty: 'Nothing to show in the current selection.',
    error: 'The network data could not be loaded.',
  },
};

const lang = () => ((document.documentElement.lang || 'pt').slice(0, 2) === 'en' ? 'en' : 'pt');

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

/** true quando a chave já está aplicada como filtro naquela dimensão. */
function isActive(name, key) {
  const state = getState();
  if (name === 'course') return state.courses.has(key);
  return state[DIMENSIONS[name].state] === key;
}

function toggle(name, key) {
  if (name === 'course') {
    const courses = new Set(getState().courses);
    if (courses.has(key)) courses.delete(key);
    else courses.add(key);
    setState({ courses });
    return;
  }
  const field = DIMENSIONS[name].state;
  setState({ [field]: getState()[field] === key ? '' : key });
}

export default async function decorate(block) {
  const config = readBlockConfig(block);
  const source = config.source || '/parcerias.json';
  const panels = Object.keys(DIMENSIONS)
    .filter((name) => config[name])
    .map((name) => ({ name, title: config[name] }));

  block.textContent = '';
  if (!panels.length) return;

  try {
    await loadCatalog(source);
  } catch (e) {
    const status = el('p', 'insights-status', TEXT[lang()].error);
    status.setAttribute('role', 'status');
    block.append(status);
    // eslint-disable-next-line no-console
    console.error('network-insights', e);
    return;
  }

  const grid = el('div', 'insights-grid');
  const bodies = {};

  panels.forEach(({ name, title }) => {
    const panel = el('article', 'insights-panel');
    const head = el('div', 'insights-head');
    head.append(el('h3', 'insights-title', title), el('p', 'insights-hint', TEXT[lang()][name]));
    const bars = el('div', 'insights-bars');
    bodies[name] = bars;
    panel.append(head, bars);
    grid.append(panel);
  });

  block.append(grid);

  function renderPanel(name) {
    const bars = bodies[name];
    const counts = countBy(name);
    const max = Math.max(1, ...counts.values());
    bars.textContent = '';

    if (!counts.size) {
      bars.append(el('p', 'insights-empty', TEXT[lang()].empty));
      return;
    }

    counts.forEach((count, key) => {
      const active = isActive(name, key);
      const bar = el('button', 'insights-bar');
      bar.type = 'button';
      bar.setAttribute('aria-pressed', String(active));

      const text = label(DIMENSIONS[name].taxonomy, key);
      const name1 = el('span', 'insights-bar-label', text);
      name1.title = text;

      const track = el('span', 'insights-bar-track');
      const fill = el('span', 'insights-bar-fill');
      fill.style.width = `${Math.round((count / max) * 100)}%`;
      track.append(fill);

      bar.append(name1, track, el('span', 'insights-bar-value', String(count)));
      bar.addEventListener('click', () => toggle(name, key));
      bars.append(bar);
    });
  }

  const render = () => panels.forEach(({ name }) => renderPanel(name));

  subscribe(render);
  render();
}
