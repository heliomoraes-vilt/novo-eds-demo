import { readBlockConfig, createOptimizedPicture } from '../../scripts/aem.js';
import {
  ACCREDITATIONS, SORTS, clearFilters, getResults, getState, label, loadCatalog,
  optionsFor, setState, subscribe,
} from '../../scripts/catalog-state.js';

/*
 * Catálogo de parceiras: busca, filtros, indicadores, ordenação, grade e detalhe.
 *
 * Os dados vêm da planilha publicada; o estado dos filtros vive em scripts/catalog-state.js,
 * para que network-insights (e o mapa, na onda 3) reajam sem importar este bloco.
 *
 * Autoria:
 *   | Partner catalog |
 *   | source    | /parcerias.json                  |
 *   | title     | Universidades parceiras          |
 *   | contact   | mailto:studentlife@insper.edu.br |
 *   | page size | 18                               |
 */

const TEXT = {
  pt: {
    search: 'Buscar universidade, cidade ou programa',
    searchPlaceholder: 'Buscar universidade, cidade ou programa...',
    filters: 'Filtros',
    continent: 'Continente / região',
    allContinents: 'Todos os continentes',
    country: 'País',
    allCountries: 'Todos os países',
    course: 'Curso no Insper',
    allCourses: 'Todos os cursos',
    selectedCourses: (n) => (n === 1 ? '1 curso selecionado' : `${n} cursos selecionados`),
    category: 'Tipo de oportunidade',
    allCategories: 'Todas as oportunidades',
    accreditations: 'Acreditações',
    clear: 'Limpar filtros',
    institutions: 'instituições',
    countries: 'países',
    regions: 'regiões',
    triple: 'com AACSB + AMBA + EQUIS',
    sort: 'Ordenar resultados',
    az: 'Universidade A–Z',
    byCountry: 'País A–Z',
    founded: 'Fundação (mais antiga)',
    meta: (shown, total) => `${total} universidades encontradas · Mostrando ${shown} de ${total}`,
    emptyTitle: 'Nenhuma universidade encontrada',
    emptyText: 'Ajuste a busca ou remova alguns filtros.',
    more: 'Mostrar mais',
    details: 'Ver detalhes',
    site: 'Site',
    coursesAt: 'Curso no Insper',
    degree: 'Grau acadêmico',
    students: 'População estudantil (aprox.)',
    foundedField: 'Fundação',
    countryField: 'País',
    opportunity: 'Tipo de oportunidade',
    compatibleCourses: 'Cursos compatíveis',
    programs: 'Programas disponíveis',
    partnerships: 'Modalidades de parceria',
    campuses: 'Campi',
    close: 'Fechar',
    website: 'Acessar site',
    talk: 'Fale com Student Life',
    loading: 'Carregando o catálogo…',
    error: 'Não foi possível carregar o catálogo de parcerias.',
    campusOf: (name) => `Campus de ${name}`,
    logoOf: (name) => `Logo de ${name}`,
  },
  en: {
    search: 'Search university, city or program',
    searchPlaceholder: 'Search university, city or program...',
    filters: 'Filters',
    continent: 'Continent / region',
    allContinents: 'All continents',
    country: 'Country',
    allCountries: 'All countries',
    course: 'Insper course',
    allCourses: 'All courses',
    selectedCourses: (n) => (n === 1 ? '1 course selected' : `${n} courses selected`),
    category: 'Opportunity type',
    allCategories: 'All opportunities',
    accreditations: 'Accreditations',
    clear: 'Clear filters',
    institutions: 'institutions',
    countries: 'countries',
    regions: 'regions',
    triple: 'with AACSB + AMBA + EQUIS',
    sort: 'Sort results',
    az: 'University A–Z',
    byCountry: 'Country A–Z',
    founded: 'Founded (oldest)',
    meta: (shown, total) => `${total} universities found · Showing ${shown} of ${total}`,
    emptyTitle: 'No university found',
    emptyText: 'Adjust the search or remove some filters.',
    more: 'Show more',
    details: 'View details',
    site: 'Website',
    coursesAt: 'Insper course',
    degree: 'Degree level',
    students: 'Student population (approx.)',
    foundedField: 'Founded',
    countryField: 'Country',
    opportunity: 'Opportunity type',
    compatibleCourses: 'Compatible courses',
    programs: 'Available programs',
    partnerships: 'Partnership types',
    campuses: 'Campuses',
    close: 'Close',
    website: 'Visit website',
    talk: 'Contact Student Life',
    loading: 'Loading the catalogue…',
    error: 'The partnership catalogue could not be loaded.',
    campusOf: (name) => `Campus of ${name}`,
    logoOf: (name) => `${name} logo`,
  },
};

const lang = () => ((document.documentElement.lang || 'pt').slice(0, 2) === 'en' ? 'en' : 'pt');
const t = (key) => TEXT[lang()][key];

const el = (tagName, className, text) => {
  const node = document.createElement(tagName);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

/** Converte o domínio guardado na planilha em uma URL segura. */
function safeUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withScheme);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
  } catch (e) {
    return '';
  }
}

function option(value, text) {
  const node = el('option', null, text);
  node.value = value;
  return node;
}

function field(labelText, control, id) {
  const wrapper = el('div', 'catalog-field');
  const labelNode = el('label', null, labelText);
  labelNode.htmlFor = id;
  control.id = id;
  wrapper.append(labelNode, control);
  return wrapper;
}

function tag(text, variant) {
  return el('span', variant ? `catalog-tag ${variant}` : 'catalog-tag', text);
}

export default async function decorate(block) {
  const config = readBlockConfig(block);
  const source = config.source || '/parcerias.json';
  const pageSize = Number(config['page-size']) || 18;
  const heading = config.title || '';
  const contact = safeUrl(config.contact) || config.contact || 'mailto:studentlife@insper.edu.br';

  block.textContent = '';
  const status = el('p', 'catalog-status', t('loading'));
  status.setAttribute('role', 'status');
  block.append(status);

  let partners;
  try {
    partners = await loadCatalog(source);
  } catch (e) {
    status.textContent = t('error');
    status.classList.add('catalog-status-error');
    // eslint-disable-next-line no-console
    console.error('partner-catalog', e);
    return;
  }
  status.remove();

  let visible = pageSize;

  /* ---------- painel de busca e filtros ---------- */
  const panel = el('div', 'catalog-panel');
  const searchRow = el('div', 'catalog-search');

  const search = el('input', 'catalog-input');
  search.type = 'search';
  search.placeholder = t('searchPlaceholder');
  search.setAttribute('aria-label', t('search'));
  search.id = 'catalog-q';

  const filterToggle = el('button', 'catalog-filter-toggle', t('filters'));
  filterToggle.type = 'button';
  filterToggle.setAttribute('aria-expanded', 'false');
  filterToggle.setAttribute('aria-controls', 'catalog-filters');
  searchRow.append(search, filterToggle);

  const filters = el('div', 'catalog-filters');
  filters.id = 'catalog-filters';

  const continentSelect = el('select', 'catalog-select');
  const countrySelect = el('select', 'catalog-select');
  const categorySelect = el('select', 'catalog-select');

  const courseBox = el('details', 'catalog-multi');
  const courseSummary = el('summary', 'catalog-multi-summary', t('allCourses'));
  const courseList = el('div', 'catalog-multi-list');
  courseBox.append(courseSummary, courseList);
  const courseField = el('div', 'catalog-field');
  courseField.append(el('span', 'catalog-field-label', t('course')), courseBox);

  const accFieldset = el('fieldset', 'catalog-acc');
  accFieldset.append(el('legend', null, t('accreditations')));

  filters.append(
    field(t('continent'), continentSelect, 'catalog-continent'),
    field(t('country'), countrySelect, 'catalog-country'),
    courseField,
    field(t('category'), categorySelect, 'catalog-category'),
    accFieldset,
  );

  const foot = el('div', 'catalog-foot');
  const chips = el('div', 'catalog-chips');
  const clearButton = el('button', 'catalog-clear', t('clear'));
  clearButton.type = 'button';
  foot.append(chips, clearButton);
  panel.append(searchRow, filters, foot);

  /* ---------- indicadores ---------- */
  const kpis = el('div', 'catalog-kpis');
  const kpiValues = {};
  [['institutions', t('institutions')], ['countries', t('countries')],
    ['regions', t('regions')], ['triple', t('triple')]].forEach(([key, text]) => {
    const item = el('div', 'catalog-kpi');
    const value = el('strong', null, '0');
    item.append(value, el('span', null, text));
    kpiValues[key] = value;
    kpis.append(item);
  });

  /* ---------- cabeçalho dos resultados ---------- */
  const head = el('div', 'catalog-results-head');
  const headText = el('div');
  if (heading) headText.append(el('h3', 'catalog-title', heading));
  const meta = el('p', 'catalog-meta');
  meta.setAttribute('role', 'status');
  headText.append(meta);
  const sortSelect = el('select', 'catalog-sort');
  sortSelect.setAttribute('aria-label', t('sort'));
  sortSelect.id = 'catalog-sort';
  SORTS.forEach((key) => {
    const text = { az: t('az'), country: t('byCountry'), founded: t('founded') }[key];
    sortSelect.append(option(key, text));
  });
  head.append(headText, sortSelect);

  /* ---------- grade, vazio e paginação ---------- */
  const cards = el('div', 'catalog-cards');
  const empty = el('div', 'catalog-empty');
  empty.hidden = true;
  empty.append(el('h3', null, t('emptyTitle')), el('p', null, t('emptyText')));
  const moreWrap = el('div', 'catalog-more');
  const moreButton = el('button', 'button primary', t('more'));
  moreButton.type = 'button';
  moreWrap.append(moreButton);

  /* ---------- detalhe ---------- */
  const dialog = el('dialog', 'catalog-dialog');
  const dialogMedia = el('div', 'catalog-dialog-media');
  const dialogHead = el('div', 'catalog-dialog-head');
  const dialogTitle = el('h3');
  const dialogLocation = el('p', 'catalog-dialog-location');
  const dialogClose = el('button', 'catalog-dialog-close', '×');
  dialogClose.type = 'button';
  dialogClose.setAttribute('aria-label', t('close'));
  const dialogHeadText = el('div');
  dialogHeadText.append(dialogTitle, dialogLocation);
  dialogHead.append(dialogHeadText, dialogClose);
  const dialogBody = el('div', 'catalog-dialog-body');
  const dialogFoot = el('div', 'catalog-dialog-foot');
  const dialogTalk = el('a', 'button secondary', t('talk'));
  dialogTalk.href = contact;
  const dialogSite = el('a', 'button primary', t('website'));
  dialogSite.target = '_blank';
  dialogSite.rel = 'noopener noreferrer';
  dialogFoot.append(dialogTalk, dialogSite);
  dialog.append(dialogMedia, dialogHead, dialogBody, dialogFoot);

  block.append(panel, kpis, head, cards, empty, moreWrap, dialog);

  /* ---------- montagem dos seletores ---------- */
  const collator = new Intl.Collator(lang());
  const courseKeys = [...new Set(partners.flatMap((p) => p.courses))]
    .sort((a, b) => collator.compare(label('curso', a), label('curso', b)));
  const categoryKeys = [...new Set(partners.flatMap((p) => p.categories))];

  function fillContinents() {
    continentSelect.textContent = '';
    continentSelect.append(option('', t('allContinents')));
    optionsFor('continent')
      .sort((a, b) => collator.compare(label('continente', a), label('continente', b)))
      .forEach((c) => continentSelect.append(option(c, label('continente', c))));
  }

  function fillCountries() {
    const { continent } = getState();
    countrySelect.textContent = '';
    countrySelect.append(option('', t('allCountries')));
    [...new Set(partners.filter((p) => !continent || p.continent === continent)
      .map((p) => p.country))]
      .sort((a, b) => collator.compare(label('pais', a), label('pais', b)))
      .forEach((c) => countrySelect.append(option(c, label('pais', c))));
  }

  categorySelect.append(option('', t('allCategories')));
  categoryKeys.forEach((c) => categorySelect.append(option(c, label('oportunidade', c))));

  courseKeys.forEach((code) => {
    const item = el('label', 'catalog-check');
    const input = el('input');
    input.type = 'checkbox';
    input.value = code;
    const text = el('span');
    text.append(el('strong', null, label('curso', code)), el('small', null, code));
    item.append(input, text);
    input.addEventListener('change', () => {
      const courses = new Set(getState().courses);
      if (input.checked) courses.add(code);
      else courses.delete(code);
      setState({ courses });
    });
    courseList.append(item);
  });

  ACCREDITATIONS.forEach((acc) => {
    const item = el('label', 'catalog-check catalog-check-inline');
    const input = el('input');
    input.type = 'checkbox';
    input.value = acc;
    item.append(input, el('span', null, acc));
    input.addEventListener('change', () => {
      const accreditations = new Set(getState().accreditations);
      if (input.checked) accreditations.add(acc);
      else accreditations.delete(acc);
      setState({ accreditations });
    });
    accFieldset.append(item);
  });

  fillContinents();
  fillCountries();

  /* ---------- detalhe ---------- */
  function section(titleText, nodes) {
    const node = el('section', 'catalog-detail-section');
    node.append(el('h4', null, titleText));
    const wrap = el('div', 'catalog-tags');
    if (nodes.length) wrap.append(...nodes);
    else wrap.append(el('span', 'catalog-tag', '—'));
    node.append(wrap);
    return node;
  }

  function openDetail(partner) {
    dialogMedia.textContent = '';
    if (partner.photo) {
      dialogMedia.append(createOptimizedPicture(partner.photo, t('campusOf')(partner.institution)));
    }
    if (partner.logo) {
      const badge = el('span', 'catalog-logo');
      const logo = el('img');
      logo.src = partner.logo;
      logo.alt = t('logoOf')(partner.institution);
      logo.loading = 'lazy';
      badge.append(logo);
      dialogMedia.append(badge);
    }
    dialogTitle.textContent = partner.institution;
    dialogLocation.textContent = [label('pais', partner.country), partner.city]
      .filter(Boolean).join(' · ');

    dialogBody.textContent = '';
    const grid = el('div', 'catalog-detail-grid');
    [[t('degree'), partner.degree || '—'],
      [t('students'), partner.population ? partner.population.toLocaleString(lang()) : '—'],
      [t('foundedField'), partner.founded || '—'],
      [t('countryField'), label('pais', partner.country)]].forEach(([name, value]) => {
      const item = el('div', 'catalog-detail');
      item.append(el('span', null, name), el('strong', null, String(value)));
      grid.append(item);
    });
    dialogBody.append(grid);

    dialogBody.append(
      section(t('opportunity'), partner.categories
        .map((c) => tag(label('oportunidade', c), 'catalog-tag-program'))),
      section(t('compatibleCourses'), partner.courses
        .map((c) => tag(`${label('curso', c)} (${c})`))),
      section(t('programs'), partner.programs.map((p) => tag(p, 'catalog-tag-program'))),
      section(t('partnerships'), partner.partnerships.map((p) => tag(p))),
    );

    const campuses = el('section', 'catalog-detail-section');
    campuses.append(el('h4', null, t('campuses')), el('p', null, partner.campuses || '—'));
    dialogBody.append(campuses);

    if (partner.accreditations.length) {
      dialogBody.append(section(t('accreditations'), partner.accreditations
        .map((a) => tag(a, 'catalog-tag-acc'))));
    }

    const site = safeUrl(partner.website);
    dialogSite.href = site || '#';
    dialogSite.hidden = !site;
    dialog.showModal();
  }

  dialogClose.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });

  /* ---------- cartão ---------- */
  function card(partner) {
    const article = el('article', 'catalog-card');

    const media = el('div', 'catalog-card-media');
    if (partner.photo) {
      media.append(createOptimizedPicture(partner.photo, t('campusOf')(partner.institution), false));
    }
    if (partner.logo) {
      const badge = el('span', 'catalog-logo');
      const logo = el('img');
      logo.src = partner.logo;
      logo.alt = t('logoOf')(partner.institution);
      logo.loading = 'lazy';
      badge.append(logo);
      media.append(badge);
    }

    const body = el('div', 'catalog-card-body');
    const origin = `${label('pais', partner.country)} · ${label('continente', partner.continent)}`;
    body.append(el('span', 'catalog-overline', origin));
    body.append(el('h3', null, partner.institution));
    if (partner.city) body.append(el('p', 'catalog-location', partner.city));

    const tags = el('div', 'catalog-tags');
    partner.categories.slice(0, 2)
      .forEach((c) => tags.append(tag(label('oportunidade', c), 'catalog-tag-program')));
    partner.accreditations.forEach((a) => tags.append(tag(a, 'catalog-tag-acc')));
    body.append(tags);

    const courseLine = el('p', 'catalog-course-line');
    const names = partner.courses.map((c) => label('curso', c));
    const preview = names.slice(0, 3).join(' · ');
    const extra = names.length > 3 ? ` +${names.length - 3}` : '';
    courseLine.append(el('strong', null, `${t('coursesAt')}: `));
    courseLine.append(document.createTextNode(`${preview}${extra}`));
    body.append(courseLine);

    const actions = el('div', 'catalog-card-actions');
    const detailsButton = el('button', null, t('details'));
    detailsButton.type = 'button';
    detailsButton.addEventListener('click', () => openDetail(partner));
    const site = safeUrl(partner.website);
    const siteLink = el('a', null, t('site'));
    siteLink.href = site || '#';
    siteLink.target = '_blank';
    siteLink.rel = 'noopener noreferrer';
    siteLink.hidden = !site;
    actions.append(detailsButton, siteLink);

    article.append(media, body, actions);
    return article;
  }

  /* ---------- chips de filtros ativos ---------- */
  function renderChips() {
    const s = getState();
    chips.textContent = '';
    const entries = [];
    if (s.q) entries.push(['q', `“${s.q}”`, () => setState({ q: '' })]);
    if (s.continent) {
      entries.push(['continent', label('continente', s.continent), () => setState({ continent: '' })]);
    }
    if (s.country) entries.push(['country', label('pais', s.country), () => setState({ country: '' })]);
    s.courses.forEach((c) => entries.push([`course-${c}`, label('curso', c), () => {
      const courses = new Set(getState().courses);
      courses.delete(c);
      setState({ courses });
    }]));
    if (s.category) {
      entries.push(['category', label('oportunidade', s.category), () => setState({ category: '' })]);
    }
    s.accreditations.forEach((a) => entries.push([`acc-${a}`, a, () => {
      const accreditations = new Set(getState().accreditations);
      accreditations.delete(a);
      setState({ accreditations });
    }]));

    entries.forEach(([key, text, remove]) => {
      const chip = el('button', 'catalog-chip');
      chip.type = 'button';
      chip.dataset.key = key;
      chip.append(document.createTextNode(text), el('span', 'catalog-chip-x', '×'));
      chip.addEventListener('click', remove);
      chips.append(chip);
    });
    clearButton.hidden = entries.length === 0;
  }

  /* ---------- render ---------- */
  function render() {
    const s = getState();
    const results = getResults();
    const total = results.length;
    const shown = Math.min(visible, total);

    kpiValues.institutions.textContent = total;
    kpiValues.countries.textContent = new Set(results.map((p) => p.country)).size;
    kpiValues.regions.textContent = new Set(results.map((p) => p.continent)).size;
    kpiValues.triple.textContent = results
      .filter((p) => ['AACSB', 'AMBA', 'EQUIS'].every((a) => p.accreditations.includes(a))).length;

    meta.textContent = t('meta')(shown, total);
    cards.textContent = '';
    results.slice(0, shown).forEach((p) => cards.append(card(p)));
    empty.hidden = total > 0;
    moreWrap.hidden = shown >= total;

    if (search.value !== s.q) search.value = s.q;
    if (continentSelect.value !== s.continent) continentSelect.value = s.continent;
    fillCountries();
    countrySelect.value = s.country;
    categorySelect.value = s.category;
    sortSelect.value = s.sort;
    courseSummary.textContent = s.courses.size
      ? t('selectedCourses')(s.courses.size) : t('allCourses');
    courseList.querySelectorAll('input').forEach((input) => {
      input.checked = s.courses.has(input.value);
    });
    accFieldset.querySelectorAll('input').forEach((input) => {
      input.checked = s.accreditations.has(input.value);
    });
    renderChips();
  }

  /* ---------- eventos ---------- */
  let searchTimer;
  search.addEventListener('input', () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => setState({ q: search.value }), 180);
  });
  continentSelect.addEventListener('change', () => setState({ continent: continentSelect.value }));
  countrySelect.addEventListener('change', () => setState({ country: countrySelect.value }));
  categorySelect.addEventListener('change', () => setState({ category: categorySelect.value }));
  sortSelect.addEventListener('change', () => setState({ sort: sortSelect.value }));
  clearButton.addEventListener('click', () => {
    search.value = '';
    clearFilters();
  });
  filterToggle.addEventListener('click', () => {
    const open = filterToggle.getAttribute('aria-expanded') === 'true';
    filterToggle.setAttribute('aria-expanded', String(!open));
    filters.classList.toggle('catalog-filters-open', !open);
  });
  moreButton.addEventListener('click', () => {
    visible += pageSize;
    render();
  });

  subscribe(() => {
    visible = pageSize;
    render();
  });

  render();
}
