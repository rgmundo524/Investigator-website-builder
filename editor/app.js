const $ = (selector, root = document) => root.querySelector(selector);
const clone = (value) => structuredClone(value);
const main = $('#main-content');
const config = JSON.parse($('#editor-config')?.textContent || '{}');
const contentTypes = [['experience', 'Employment'], ['credentials', 'Credential or training'], ['education', 'Education'], ['expertise', 'Area of expertise'], ['projects', 'Project'], ['interests', 'Interest'], ['resources', 'Resource'], ['articles', 'Article'], ['skills', 'Skill'], ['activities', 'Community activity']];
const contentGroups = [
  { id: 'profile', label: 'Profile & contact', collections: ['profile', 'contacts'], description: 'Your shared identity and contact information. Choose portraits in Pages, and write your biography in Pages → About.' },
  { id: 'pages', label: 'Pages', collections: ['pages'], description: 'Choose a page, select its shared records, arrange its sections, and write the text that belongs to that page.' },
  { id: 'career', label: 'Career', collections: ['experience'], description: 'Jobs and employment history shown on your website.' },
  { id: 'education', label: 'Education', collections: ['education'], description: 'Degree programs and other education shown on your website.' },
  { id: 'credentials', label: 'Credentials', collections: ['credentials'], description: 'Certifications, certificates, and training shown on your website.' },
  { id: 'expertise', label: 'Expertise', collections: ['expertise'], description: 'Your shared expertise library. Create each record once, then choose it on any number of pages.' },
  { id: 'skills', label: 'Skills', collections: ['skills'], description: 'Your shared skill descriptions and ratings. Assign skills to groups and arrange them in Pages.' },
  { id: 'projects', label: 'Projects', collections: ['projects', 'repositories'], description: 'Project and repository entries displayed within the website’s pages.' },
  { id: 'interests', label: 'Interests & community', collections: ['interests', 'activities'], description: 'Personal interests and community activities displayed within the website’s pages.' },
  { id: 'resources', label: 'Resources & writing', collections: ['resources', 'articles'], description: 'Resource links and written articles.' },
  { id: 'settings', label: 'Settings', collections: ['settings', 'site'], description: 'Website-wide settings, navigation, and display options.' },
  { id: 'other', label: 'Other', collections: [], description: 'Additional supporting content, including callouts.' },
];

// Keep the HTTP contract in one place. The editor never writes website files itself.
async function request(path, data) {
  const response = await fetch(`/api/${path}`, {
    method: data === undefined ? 'GET' : 'POST',
    credentials: 'same-origin',
    headers: { Accept: 'application/json', 'X-Editor-Token': config.token || '', ...(state.workspaceId ? { 'X-Workspace-Id': state.workspaceId } : {}), ...(data === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  let result;
  try { result = await response.json(); } catch { throw new Error(`The website builder returned an unreadable response (${response.status}).`); }
  if (!response.ok) throw new Error(result.error || `The request could not be completed (${response.status}).`);
  return result;
}
const api = {
  state: () => request('state'),
  open: (path) => request('workspace', { path }),
  create: (path) => request('workspace/new', { path }),
  folders: (path = '') => request(`folders?path=${encodeURIComponent(path)}`),
  record: (file) => request(`record?file=${encodeURIComponent(file)}`),
  reports: (file) => request(`reports?file=${encodeURIComponent(file)}`),
  rename: (file, newName, sourceHash, expectedDraftHash) => request('rename', { file, newName, sourceHash, expectedDraftHash }),
  removeCase: (file, sourceHash, expectedDraftHash) => request('remove-case', { file, sourceHash, expectedDraftHash }),
  restoreCase: (id) => request('restore-case', { id }),
  template: (collection) => request(`template?collection=${encodeURIComponent(collection)}`),
  save: (draft) => request('drafts', draft),
  review: (file) => request(`review?file=${encodeURIComponent(file)}`),
  apply: (file, publication_status, expectedDraftHash) => request('apply', { file, publication_status, expectedDraftHash }),
  discard: (file, expectedDraftHash) => request('discard', { file, expectedDraftHash }),
  jobs: () => request('jobs'),
  job: (kind, destination) => request('jobs', { kind, ...(destination ? { destination } : {}) }),
  stop: () => request('jobs/stop', {}),
  assets: () => request('assets'),
  icons: () => request('icons'),
  asset: async (file) => {
    const response = await fetch(`/api/asset?file=${encodeURIComponent(file)}`, { credentials: 'same-origin', headers: { 'X-Editor-Token': config.token || '', 'X-Workspace-Id': state.workspaceId || '' } });
    if (!response.ok) throw new Error('The local image could not be previewed. Check that the file exists and restart the builder if it was running before this update.');
    return response.blob();
  },
  upload: (data) => request('assets', data),
};

const state = { workspace: null, workspaceId: null, browseRoot: '', jobs: {}, view: 'cases', query: '', caseFilter: null, contentGroup: 'profile', contentNavigation: {}, contentWorkspaceId: null, selectedFile: null, editing: null, dirty: false, saving: false, review: null, reviewFile: null, releaseDestination: '', folderAction: 'open', pollingFailed: false };
let caseChartsModule, caseChartsMount, caseChartsContainer, caseChartsKey;
let caseChartsGeneration = 0;

function disposeCaseCharts() {
  caseChartsGeneration++;
  caseChartsMount?.dispose();
  caseChartsMount = null; caseChartsContainer = null; caseChartsKey = null;
}
function refreshCaseCharts() {
  const container = $('#case-chart-navigation');
  if (state.view !== 'cases' || !container) return;
  const catalog = state.workspace?.caseCharts;
  const key = JSON.stringify(catalog);
  if (caseChartsContainer === container && caseChartsKey === key) return;
  disposeCaseCharts();
  caseChartsContainer = container; caseChartsKey = key;
  if (!catalog) {
    container.replaceChildren(h('p', { class: 'field-hint' }, 'Restart the builder to load the case category charts.'));
    return;
  }
  const generation = caseChartsGeneration;
  const workspaceId = state.workspaceId;
  container.replaceChildren(h('p', { class: 'field-hint' }, 'Loading category charts…'));
  caseChartsModule ||= import('/case-charts.js').catch(error => { caseChartsModule = null; throw error; });
  caseChartsModule.then(module => {
    if (generation !== caseChartsGeneration || workspaceId !== state.workspaceId || !container.isConnected) return;
    caseChartsMount = module.mountEditorCaseCharts(container, catalog, {
      selectedId: state.caseFilter?.id,
      onSelect(selection) {
        if (generation !== caseChartsGeneration || workspaceId !== state.workspaceId || !container.isConnected) return;
        state.caseFilter = selection; renderRecordList();
      },
    });
  }).catch(() => {
    if (generation !== caseChartsGeneration || !container.isConnected) return;
    state.caseFilter = null;
    container.replaceChildren(h('p', { class: 'field-error', role: 'status' }, 'The category charts could not load. You can still search and edit every case below. Reload the builder to try again.'));
    renderRecordList();
  });
}

function h(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key in node && !key.startsWith('aria-') && key !== 'list') node[key] = value;
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children.flat(Infinity)) if (child !== null && child !== undefined && child !== false) node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  return node;
}
function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'icon'); svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use'); use.setAttribute('href', `#icon-${name}`); svg.append(use); return svg;
}
let contentIconsRequest;
function contentIcons() {
  contentIconsRequest ||= api.icons().then(result => result.icons).catch(error => { contentIconsRequest = null; throw error; });
  return contentIconsRequest;
}
function contentIconField(editing, field, controls) {
  const current = editing.data.icon || (editing.collection === 'activities' ? 'users' : editing.collection === 'interests' ? 'lightbulb' : 'code');
  const node = field('icon', 'Heading icon', { full: true, value: current, choices: [[current, current.replaceAll('-', ' ')]], hint: 'Choose the symbol displayed beside this record’s heading wherever it appears.' });
  const input = controls.get('icon').input;
  const image = h('img', { class: 'content-icon-preview', alt: '', 'aria-hidden': 'true', hidden: true });
  const status = h('p', { class: 'field-hint', role: 'status' }, 'Loading icon choices…');
  let choices = [];
  const matchesSelected = choice => choice.name === input.value || choice.aliases?.includes(input.value);
  const showPreview = () => {
    const choice = choices.find(matchesSelected);
    image.hidden = !choice;
    if (choice) { image.src = `data:image/svg+xml,${encodeURIComponent(choice.svg)}`; status.textContent = `Selected icon: ${choice.label}.`; }
    else status.textContent = 'The saved icon is kept. Choose a supported icon before applying this record.';
  };
  input.addEventListener('change', showPreview);
  const browse = button('Choose icon visually', () => {
    const dialog = h('dialog', { class: 'folder-dialog content-icon-dialog', 'aria-labelledby': 'content-icon-dialog-title' });
    const search = h('input', { id: 'content-icon-search', type: 'search', placeholder: 'Find an icon…' });
    const grid = h('div', { class: 'content-icon-grid', role: 'group', 'aria-label': 'Available icons' });
    const pageSize = 48; let page = 0;
    const count = h('p', { class: 'field-hint content-icon-count', role: 'status', 'aria-live': 'polite' });
    const previous = h('button', { type: 'button', class: 'button button-subtle', onclick: () => { page--; draw(); } }, 'Previous icons');
    const next = h('button', { type: 'button', class: 'button button-subtle', onclick: () => { page++; draw(); } }, 'Next icons');
    function draw() {
      const query = search.value.trim().toLowerCase();
      const terms = query.split(/[\s-]+/).filter(Boolean);
      const available = choices.filter(choice => terms.every(term => `${choice.label} ${choice.name} ${(choice.aliases || []).join(' ')}`.toLowerCase().includes(term)));
      page = Math.max(0, Math.min(page, Math.ceil(available.length / pageSize) - 1));
      const start = page * pageSize;
      const visible = available.slice(start, start + pageSize);
      count.textContent = available.length ? `Showing ${start + 1}–${start + visible.length} of ${available.length.toLocaleString()}${query ? ' matching' : ''} icons.` : 'No matching icons. Try another search.';
      previous.disabled = page === 0; next.disabled = start + pageSize >= available.length;
      previous.hidden = next.hidden = available.length <= pageSize;
      grid.replaceChildren(...visible.map(choice => h('button', {
        type: 'button', class: 'content-icon-choice', 'aria-label': `Choose ${choice.label} icon`, 'aria-pressed': String(matchesSelected(choice)),
        onclick: () => {
          if (state.editing !== editing || !node.isConnected) return dialog.close();
          input.value = choice.name; input.dispatchEvent(new Event('change', { bubbles: true })); dialog.close();
        },
      }, h('img', { src: `data:image/svg+xml,${encodeURIComponent(choice.svg)}`, alt: '', 'aria-hidden': 'true' }), h('span', {}, choice.label))));
      if (!available.length) grid.append(h('p', { class: 'field-hint' }, 'No matching icons. Try another search.'));
    }
    search.addEventListener('input', () => { page = 0; draw(); });
    dialog.append(h('div', { class: 'dialog-heading' }, h('h2', { id: 'content-icon-dialog-title' }, 'Choose a heading icon'), button('Close', () => dialog.close(), 'quiet')),
      h('div', { class: 'field' }, h('label', { htmlFor: search.id }, 'Find an icon'), search),
      h('div', { class: 'content-icon-pagination' }, count, h('div', { class: 'page-row-actions' }, previous, next)), grid);
    dialog.addEventListener('close', () => { dialog.remove(); if (input.isConnected) input.focus(); }, { once: true });
    document.body.append(dialog); draw(); dialog.showModal(); search.focus();
  });
  browse.disabled = true;
  node.append(h('div', { class: 'content-icon-tools' }, image, browse), status);
  async function load() {
    browse.disabled = true;
    try {
      choices = await contentIcons();
      if (!node.isConnected || state.editing !== editing) return;
      const selected = input.value;
      input.replaceChildren(...choices.map(choice => h('option', { value: choice.name }, choice.label)));
      if (!choices.some(choice => choice.name === selected)) {
        const alias = choices.find(choice => choice.aliases?.includes(selected));
        input.append(h('option', { value: selected }, alias ? `${alias.label} (saved name)` : `${selected} (saved icon)`));
      }
      input.value = selected; browse.disabled = false; showPreview();
    } catch (error) {
      if (!node.isConnected) return;
      status.textContent = `Icon choices could not be loaded: ${error.message}. Your saved icon is unchanged.`;
      retry.hidden = false;
    }
  }
  const retry = button('Reload icon choices', () => { retry.hidden = true; return load(); }); retry.hidden = true;
  node.append(retry); queueMicrotask(load);
  return node;
}
function skillRatingField(field, controls) {
  const node = field('proficiency', 'Self-assessed rating', { type: 'number', numeric: true, min: '1', max: '5', step: '0.5', full: true,
    hint: 'Enter 1–5 in half-point steps, then adjust with the slider. Leave blank to show the skill without a rating.' });
  const input = controls.get('proficiency').input;
  const slider = h('input', { id: 'skill-rating-slider', type: 'range', min: '1', max: '5', step: '0.5', value: '1', disabled: true,
    'aria-describedby': `${input.getAttribute('aria-describedby')} skill-rating-summary`,
    oninput: () => { input.value = slider.value; input.dispatchEvent(new Event('input', { bubbles: true })); } });
  const summary = h('output', { id: 'skill-rating-summary', class: 'skill-rating-summary', for: `${input.id} ${slider.id}`, role: 'status', 'aria-live': 'polite' });
  const error = h('p', { id: 'skill-rating-error', class: 'field-error', hidden: true });
  input.setAttribute('aria-describedby', `${input.getAttribute('aria-describedby')} ${error.id}`);
  const levels = ['Foundational', 'Developing', 'Proficient', 'Advanced', 'Expert'];
  function update() {
    const empty = input.value === '' && !input.validity.badInput;
    const value = Number(input.value);
    const valid = !empty && !input.validity.badInput && value >= 1 && value <= 5 && Number.isInteger(value * 2);
    input.setCustomValidity(empty || valid ? '' : 'Use a rating from 1 to 5, in half-point steps.');
    error.hidden = empty || valid;
    error.textContent = error.hidden ? '' : input.validationMessage;
    input.setAttribute('aria-invalid', String(!empty && !valid));
    slider.disabled = !valid;
    if (valid) {
      slider.value = input.value;
      const label = Number.isInteger(value) ? levels[value - 1] : `Between ${levels[Math.floor(value) - 1]} and ${levels[Math.ceil(value) - 1]}`;
      summary.textContent = `${value} / 5 — ${label}`;
      slider.setAttribute('aria-valuetext', summary.textContent);
    } else {
      summary.textContent = empty ? 'No rating set.' : 'Correct the number to adjust the slider.';
      slider.removeAttribute('aria-valuetext');
    }
  }
  input.addEventListener('input', update);
  input.addEventListener('change', update);
  node.append(h('div', { class: 'skill-rating-slider' }, h('label', { htmlFor: slider.id }, 'Adjust self-assessed rating'), slider,
    h('div', { class: 'skill-rating-scale', 'aria-hidden': 'true' }, h('span', {}, '1 · Foundational'), h('span', {}, '5 · Expert'))), summary, error);
  update();
  return node;
}
function button(text, action, variant = 'subtle', iconName) {
  return h('button', { type: 'button', class: `button button-${variant}`, onclick: (event) => perform(action, event.currentTarget) }, iconName && icon(iconName), text);
}
async function perform(action, target) {
  if (target) target.disabled = true;
  try { await action(); } catch (error) { notify(error.message || String(error), true); }
  finally { if (target?.isConnected) target.disabled = false; }
}
function notify(message, isError = false) {
  const notice = $('#notice');
  notice.className = `notice${isError ? ' is-error' : ''}`;
  notice.replaceChildren(h('span', {}, message), h('button', { type: 'button', class: 'icon-button', 'aria-label': 'Dismiss message', onclick: () => { notice.hidden = true; } }, '×'));
  notice.setAttribute('role', isError ? 'alert' : 'status'); notice.hidden = false;
}
function heading(title, description, action) {
  return h('div', { class: 'page-heading' }, h('div', {}, h('h1', {}, title), h('p', {}, description)), action && h('div', { class: 'heading-action' }, action));
}
function empty(title, description, action, iconName = 'folder') {
  return h('div', { class: 'empty-state' }, h('span', { class: 'empty-icon' }, icon(iconName)), h('h2', {}, title), h('p', {}, description), action);
}
function recordTitle(record) {
  const number = record.case_number || record.data?.case_number;
  if ((record.collection === 'cases' || record.file?.startsWith('content/cases/')) && number) return `Case ${number}`;
  if (record.collection === 'experience' && record.data?.role) return `${record.data.role} · ${record.data.organization}`;
  return record.title || record.data?.title || record.data?.name || record.data?.program || record.id || record.file || 'Untitled record';
}
function caseSubtitle(record) {
  return record.case_number || record.data?.case_number ? record.title || record.data?.title || '' : 'Case number not entered';
}
function slugFrom(value) { return value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
function friendlyCollection(collection) { return { pages: 'Page', profile: 'Profile', contacts: 'Contact', cases: 'Case', charts: 'Investigation group', site: 'Site settings', settings: 'Site settings', experience: 'Employment', credentials: 'Credential', education: 'Education', expertise: 'Expertise', projects: 'Project', interests: 'Interest', resources: 'Resource', articles: 'Article', skills: 'Skill', activities: 'Activity' }[collection] || collection?.replaceAll('-', ' ') || 'Content'; }
function badge(text, color = '') { return h('span', { class: `badge${color ? ` badge-${color}` : ''}` }, text); }
function issueMessage(issue) { return typeof issue === 'string' ? issue : [Array.isArray(issue.path) ? issue.path.join('.') : issue.path, issue.message || issue.error].filter(Boolean).join(': ') || JSON.stringify(issue); }
function issueList(issues) { return h('ul', { class: 'validation-list' }, ...(issues || []).map((issue) => h('li', {}, issueMessage(issue)))); }
function valueText(value) { return value === undefined || value === null || value === '' ? '—' : typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value); }
function removedFields(before, after, prefix = '') {
  const removals = [];
  if (!before || Array.isArray(before) || typeof before !== 'object' || !after || Array.isArray(after) || typeof after !== 'object') return removals;
  for (const [key, value] of Object.entries(before)) {
    const field = prefix ? `${prefix}.${key}` : key;
    if (!Object.hasOwn(after, key)) removals.push(field);
    else removals.push(...removedFields(value, after[key], field));
  }
  return removals;
}
let selectionRequest = 0;
function draftRecords() {
  const records = (state.workspace?.records || []).filter((entry) => entry.hasDraft);
  if ((state.workspace?.settings?.draft || state.workspace?.settings?.hasDraft) && !records.some((entry) => entry.file === 'site.json')) records.unshift({ file: 'site.json', title: 'Site settings', collection: 'settings', id: 'site-settings' });
  return records;
}
function setDirty() {
  state.dirty = true;
  for (const action of document.querySelectorAll('[data-edit-record-title]')) updateRecordEditLabel(action);
  const label = $('#save-state'); if (label) { label.textContent = 'Unsaved changes'; label.classList.add('is-dirty'); }
  const rename = $('#rename-case-file'); if (rename) rename.disabled = true;
  const renameHint = $('#rename-case-hint'); if (renameHint) renameHint.textContent = 'Save and apply, or discard, your content changes before renaming this file.';
  const remove = $('#remove-case'); if (remove) { remove.disabled = true; remove.title = 'Save and apply, or discard, your content changes before removing this case.'; }
}
function mayLeave() { return !state.dirty || window.confirm('You have unsaved changes. Leave this form without saving them?'); }
function updateRecordEditLabel(action) {
  const label = state.dirty ? 'Save draft & edit record' : 'Edit record';
  action.textContent = label;
  action.setAttribute('aria-label', `${label}: ${action.dataset.editRecordTitle}`);
}
function recordEditButton(editing, resolveRecord) {
  const action = button('Edit record', async () => {
    if (state.saving || state.editing !== editing) return;
    const record = resolveRecord();
    if (!record?.file) return;
    if (state.dirty) {
      if (!$('#record-form')?.reportValidity() || !await editing.saveDraft()) return;
    }
    const view = record.collection === 'charts' ? 'categories' : record.collection === 'cases' ? 'cases' : 'content';
    await selectRecord(record.file, { view });
  });
  action.title = 'Edit the shared record used by this page. Unsaved page changes are saved as a working draft first.';
  const update = () => {
    const record = resolveRecord();
    action.dataset.editRecordTitle = record ? recordTitle(record) : 'Unavailable record';
    action.disabled = !record?.file;
    updateRecordEditLabel(action);
  };
  update();
  return { node: action, update };
}
function updateHeader() {
  const workspace = state.workspace;
  const profile = workspace?.records?.find((entry) => entry.collection === 'profile');
  $('#investigator-name').textContent = profile?.title || workspace?.name || (workspace ? 'Investigator Website Builder' : 'Choose a content folder');
  $('#active-folder').textContent = workspace?.dataDir || 'No folder selected';
  $('#active-folder').title = workspace?.dataDir || '';
  $('#case-count').textContent = workspace ? String(workspace.records.filter((entry) => entry.collection === 'cases').length) : '—';
  $('#review-count').textContent = String(draftRecords().length);
  for (const nav of document.querySelectorAll('[data-view]')) { const active = nav.dataset.view === state.view; nav.classList.toggle('is-current', active); if (active) nav.setAttribute('aria-current', 'page'); else nav.removeAttribute('aria-current'); }
}
async function refreshState() {
  const result = await api.state();
  if (state.workspaceId !== result.workspaceId) state.caseFilter = null;
  state.workspace = result.workspace; state.workspaceId = result.workspaceId; state.browseRoot = result.browseRoot || ''; state.jobs = result.jobs || {}; state.pollingFailed = false; updateHeader(); return result;
}
async function navigate(view) {
  if (!mayLeave()) return;
  disposeCaseCharts();
  if (state.view === 'content') rememberContentSelection();
  selectionRequest++;
  state.dirty = false; state.editing = null; state.view = view; state.query = ''; state.selectedFile = null; state.review = null; state.reviewFile = null; updateHeader();
  if (view === 'content') {
    ensureContentNavigation();
    state.query = state.contentNavigation[contentNavigationKey()]?.query || '';
  }
  if (view === 'review' && state.workspace) await renderReview(); else render();
  if (view === 'content') await restoreContentSelection();
}
function render() {
  disposeCaseCharts();
  updateHeader();
  if (!state.workspace) {
    main.replaceChildren(heading('Investigator Website Builder', 'Prepare, review, and publish your professional website.'), h('section', { class: 'panel' }, empty('Start with your content folder', 'Open your investigator folder, or create a blank content pack. Your original reports and private evidence belong outside website content.', h('div', { class: 'editor-action-group' }, button('Open a folder', () => openFolderDialog('open'), 'primary', 'folder'), button('Create blank content pack', () => openFolderDialog('new'))))));
    return;
  }
  if (state.view === 'release') { renderRelease(); return; }
  if (state.view === 'review') { renderReviewShell(); return; }
  renderRecords();
}

function contentGroupFor(collection) { return contentGroups.find((group) => group.collections.includes(collection)) || contentGroups.at(-1); }
function contentNavigationKey() { return state.contentGroup; }
function allContentRecords() {
  const records = (state.workspace?.records || []).filter((entry) => !['cases', 'charts'].includes(entry.collection));
  if (state.workspace?.settings) records.unshift({ file: 'site.json', collection: 'settings', id: 'site-settings', title: 'Site settings', issues: state.workspace.settings.issues || [], hasDraft: Boolean(state.workspace.settings.draft || state.workspace.settings.hasDraft || records.some((entry) => entry.file === 'site.json' && entry.hasDraft)) });
  return records.filter((entry, index) => records.findIndex((other) => other.file === entry.file) === index);
}
function ensureContentNavigation() {
  if (state.contentWorkspaceId === state.workspaceId) return;
  state.contentWorkspaceId = state.workspaceId;
  state.contentGroup = 'profile'; state.contentNavigation = {};
}
function rememberContentSelection() {
  const key = contentNavigationKey();
  state.contentNavigation[key] = { query: state.query, selectedFile: state.selectedFile || state.contentNavigation[key]?.selectedFile || null };
}
async function restoreContentSelection() {
  const key = contentNavigationKey();
  const file = state.contentNavigation[key]?.selectedFile;
  const entry = file && allContentRecords().find(entry => entry.file === file && contentGroupFor(entry.collection).id === state.contentGroup);
  if (entry) await selectRecord(file);
  else if (state.contentNavigation[key]) state.contentNavigation[key].selectedFile = null;
}
async function selectContentGroup(id) {
  if (id === state.contentGroup || !mayLeave()) return;
  rememberContentSelection();
  selectionRequest++;
  state.contentGroup = id; state.query = state.contentNavigation[contentNavigationKey()]?.query || '';
  state.selectedFile = null; state.editing = null; state.dirty = false;
  renderRecords();
  await restoreContentSelection();
}
function renderContentGroups() {
  const records = allContentRecords();
  return h('nav', { class: 'content-groups', 'aria-label': 'Profile and pages groups' }, ...contentGroups.filter((group) => group.id !== 'other' || records.some((entry) => contentGroupFor(entry.collection).id === 'other')).map((group) => {
    const count = records.filter((entry) => contentGroupFor(entry.collection).id === group.id).length;
    return h('button', { type: 'button', class: `content-group-button${group.id === state.contentGroup ? ' is-selected' : ''}`, 'aria-pressed': group.id === state.contentGroup ? 'true' : 'false', onclick: () => perform(() => selectContentGroup(group.id)) }, group.label, h('span', { class: 'content-group-count' }, count));
  }));
}
function listRecords() {
  const records = state.view === 'content' ? allContentRecords().filter((entry) => contentGroupFor(entry.collection).id === state.contentGroup) : (state.workspace?.records || []).filter((entry) => state.view === 'cases' ? entry.collection === 'cases' : entry.collection === 'charts');
  const selectedCases = state.view === 'cases' && state.caseFilter ? new Set(state.caseFilter.files) : null;
  return records.filter((entry) => (!selectedCases || selectedCases.has(entry.file)) && `${recordTitle(entry)} ${entry.title || ''} ${entry.id} ${entry.collection}`.toLowerCase().includes(state.query.toLowerCase()));
}
function renderRecords() {
  disposeCaseCharts();
  const isCase = state.view === 'cases';
  const isCategories = state.view === 'categories';
  const isContent = state.view === 'content';
  if (isContent) {
    ensureContentNavigation();
    if (state.editing) {
      const group = contentGroupFor(state.editing.file === 'site.json' ? 'settings' : state.editing.collection).id;
      if (state.contentGroup !== group) { state.contentGroup = group; state.query = ''; }
    }
  }
  const group = contentGroups.find((entry) => entry.id === state.contentGroup);
  const list = h('div', { class: 'record-list', id: 'record-list', 'aria-label': isCase ? 'Case records' : isCategories ? 'Investigation groups' : 'Content records' });
  const editor = h('div', { class: 'record-editor', id: 'record-editor' });
  const search = h('input', { type: 'search', placeholder: isCase ? 'Search cases…' : isCategories ? 'Search investigation groups…' : `Search ${group.label.toLowerCase()}…`, value: state.query, 'aria-label': isCase ? 'Search cases' : isCategories ? 'Search investigation groups' : `Search ${group.label.toLowerCase()}`, oninput: (event) => { state.query = event.target.value; renderRecordList(); } });
  main.replaceChildren(heading(isCase ? 'Cases' : isCategories ? 'Categories' : 'Profile & pages', isCase ? 'A public record of completed investigations. Use report case numbers and anonymized descriptions.' : isCategories ? 'Choose an investigation group to add, rename, or reorder its categories. Save and apply changes before assigning them to cases.' : 'Store reusable information in the libraries. Choose where it appears and write page-specific text in Pages.', isCase ? h('div', { class: 'editor-action-group case-list-actions' }, button(`Removed cases (${state.workspace.removedCases?.length || 0})`, openRemovedCases), button('New case', newCase, 'primary', 'plus')) : isCategories ? null : h('div', { class: 'editor-action-group' }, button('New record', newContentDialog, 'primary', 'plus'), button('Add an image', renderAssetDialog, 'subtle'))),
    isCase && h('details', { class: 'panel case-chart-navigation', open: true }, h('summary', {}, 'Filter by case type'), h('p', { class: 'case-filter-intro' }, 'Select a slice to filter the cases below, then follow its subcategories. Includes saved working drafts.'), h('div', { id: 'case-chart-navigation' })),
    h('section', { class: `panel${isContent ? ' content-records-panel' : ''}` }, isContent && renderContentGroups(), isContent && h('div', { class: 'content-group-summary' }, h('h2', {}, group.label), h('p', {}, group.description)), h('div', { class: 'toolbar' }, h('div', { class: 'search-box' }, icon('search'), search), h('span', { class: 'toolbar-count', id: 'list-count' })), h('div', { class: 'records-layout' }, list, editor)));
  renderRecordList();
  if (state.editing) renderEditor();
  else editor.append(empty(isCategories ? 'Choose an investigation group' : 'Choose a record', isCase ? 'Select a case to review its details, or start a new case.' : isCategories ? 'Select a group to manage the category labels used by its cases and the public case explorer.' : `Choose a record from ${group.label.toLowerCase()} to edit its website content.`, null, isCase ? 'cases' : isCategories ? 'categories' : 'profile'));
}
function renderRecordList() {
  if (state.view === 'content' && state.editing) {
    const group = contentGroupFor(state.editing.file === 'site.json' ? 'settings' : state.editing.collection).id;
    if (group !== state.contentGroup) { state.contentGroup = group; state.query = ''; renderRecords(); return; }
  }
  const list = $('#record-list'); if (!list) return;
  if (state.view === 'content') rememberContentSelection();
  const records = listRecords();
  const unit = state.view === 'categories' ? 'group' : 'record';
  const caseTotal = state.view === 'cases' ? state.workspace.records.filter(entry => entry.collection === 'cases').length : null;
  $('#list-count').textContent = caseTotal === null ? `${records.length} ${unit}${records.length === 1 ? '' : 's'}` : `${records.length} of ${caseTotal} cases`;
  list.replaceChildren(...records.map((entry) => h('button', { type: 'button', class: `record-item${state.selectedFile === entry.file ? ' is-selected' : ''}`, onclick: () => perform(() => selectRecord(entry.file)) }, h('span', { class: 'record-title' }, recordTitle(entry)), h('span', { class: 'record-subtitle' }, entry.collection === 'cases' ? caseSubtitle(entry) : `${friendlyCollection(entry.collection)} · ${entry.id}`), h('span', { class: 'record-meta' }, entry.hasDraft ? badge('Working draft', 'gold') : entry.publication_status && badge(entry.publication_status === 'published' ? 'Published' : 'Draft', entry.publication_status === 'published' ? 'teal' : ''), entry.issues?.length > 0 && badge('Needs attention', 'red')))));
  if (!records.length) list.append(h('div', { class: 'small-empty' }, state.query || state.caseFilter ? 'No records match your search and category filter.' : 'No records here yet.'));
  if (state.view === 'cases') refreshCaseCharts();
}
async function selectRecord(file, { view = state.view } = {}) {
  if (!mayLeave()) return false;
  const selection = ++selectionRequest;
  const record = await api.record(file);
  if (selection !== selectionRequest) return false;
  const changeView = view !== state.view;
  if (changeView && state.view === 'content') rememberContentSelection();
  const draft = record.draft;
  state.view = view; state.selectedFile = file; state.dirty = false;
  state.editing = { ...record, file, sourceData: clone(record.data), data: clone(draft?.data ?? record.data), body: draft?.body ?? record.body ?? '', sourceHash: draft?.sourceHash ?? record.sourceHash ?? null, hadDraft: Boolean(draft), isNew: record.sourceHash === null, draft };
  if (changeView) { state.query = ''; updateHeader(); renderRecords(); } else { renderRecordList(); renderEditor(); }
  return true;
}
async function newCase() {
  if (!mayLeave()) return;
  selectionRequest++;
  const chart = state.workspace.charts?.[0];
  state.selectedFile = null; state.dirty = false;
  state.editing = { file: null, collection: 'cases', id: '', sourceHash: null, draftHash: null, isNew: true, body: '', data: { slug: '', publication_status: 'draft', title: '', description_short: '', chart: chart?.id || '', category: chart?.categories?.[0]?.id || '', subcategory: [], content_kind: 'case_study', opened_on: null, closed_on: null, networks: [], assets: [], jurisdictions: [], services: [], metrics: { reported_loss_usd: null, assets_reviewed_usd: null }, links: [] } };
  renderRecordList(); renderEditor(); $('#field-case_number')?.focus();
}

function openRemoveCase(editing) {
  if (state.dirty || editing.hadDraft) throw new Error('Save and apply, or discard, your content changes before removing this case.');
  if (!editing.file || editing.sourceHash === null || state.editing !== editing) throw new Error('Select an existing case before removing it.');
  const workspaceId = state.workspaceId;
  const title = recordTitle(editing);
  let busy = false;
  const dialog = h('dialog', { class: 'folder-dialog', 'aria-labelledby': 'remove-case-title', 'aria-describedby': 'remove-case-description' });
  const error = h('p', { class: 'field-error', role: 'alert', hidden: true });
  const cancel = button('Cancel', () => dialog.close());
  const remove = button('Remove case', async () => {
    if (busy) return;
    busy = true; cancel.disabled = true; error.hidden = true;
    try {
      if (state.workspaceId !== workspaceId || state.editing !== editing || state.dirty || editing.hadDraft) throw new Error('The selected case changed. Close this dialog and review the case again.');
      await api.removeCase(editing.file, editing.sourceHash, editing.draftHash ?? null);
      selectionRequest++; state.dirty = false; state.editing = null; state.selectedFile = null;
      await refreshState(); render(); dialog.close();
      notify(`${title} removed from the catalog. You can restore it from Removed cases.`);
    } catch (issue) {
      error.textContent = issue.message || String(issue); error.hidden = false;
    } finally { busy = false; if (cancel.isConnected) cancel.disabled = false; }
  }, 'danger');
  dialog.append(h('div', { class: 'dialog-heading' }, h('h2', { id: 'remove-case-title' }, `Remove ${title}?`)),
    h('div', { id: 'remove-case-description' }, h('p', { class: 'muted' }, 'This removes the case from your local catalog and future website builds. Its original reports stay untouched.'), h('p', { class: 'muted' }, 'The case will be kept in Removed cases so you can restore it. Your live website changes only after you rebuild and deploy.')),
    error, h('div', { class: 'dialog-actions' }, cancel, remove));
  dialog.addEventListener('cancel', (event) => { if (busy) event.preventDefault(); });
  dialog.addEventListener('close', () => dialog.remove(), { once: true });
  document.body.append(dialog); dialog.showModal(); cancel.focus();
}

async function openRemovedCases() {
  if (!mayLeave()) return;
  selectionRequest++; state.dirty = false; state.editing = null; state.selectedFile = null;
  await refreshState(); render();
  const workspaceId = state.workspaceId;
  let busy = false;
  const dialog = h('dialog', { class: 'folder-dialog removed-cases-dialog', 'aria-labelledby': 'removed-cases-title', 'aria-describedby': 'removed-cases-description' });
  const list = h('ul', { class: 'removed-cases-list', 'aria-label': 'Removed cases' });
  const message = h('p', { class: 'muted', role: 'status', hidden: true });
  const error = h('p', { class: 'field-error', role: 'alert', hidden: true });
  const close = button('Close', () => dialog.close(), 'quiet');
  function draw() {
    const cases = state.workspace.removedCases || [];
    list.replaceChildren(...cases.map((entry) => {
      const title = recordTitle({ ...entry, collection: 'cases' });
      const restore = button('Restore case', async () => {
        if (busy) return;
        busy = true; error.hidden = true; message.hidden = true; close.disabled = true;
        for (const action of list.querySelectorAll('button')) action.disabled = true;
        try {
          if (state.workspaceId !== workspaceId) throw new Error('The content folder changed. Close this dialog and open Removed cases again.');
          await api.restoreCase(entry.id);
          await refreshState(); render(); draw();
          message.textContent = `${title} restored to the catalog.`; message.hidden = false;
          notify(`${title} restored to the catalog.`);
        } catch (issue) {
          error.textContent = issue.message || String(issue); error.hidden = false;
        } finally {
          busy = false; if (close.isConnected) close.disabled = false;
          for (const action of list.querySelectorAll('button')) action.disabled = false;
          if (message.hidden === false && close.isConnected) close.focus();
        }
      });
      restore.setAttribute('aria-label', `Restore ${title}`);
      const removedDate = new Date(entry.removedAt);
      const dateLabel = Number.isNaN(removedDate.getTime()) ? '' : `Removed ${removedDate.toLocaleDateString()}`;
      return h('li', { class: 'removed-case-row' }, h('div', {}, h('strong', { class: 'record-title' }, title), entry.case_number && entry.title && h('span', { class: 'record-subtitle' }, entry.title), h('span', { class: 'record-subtitle' }, entry.file), dateLabel && h('span', { class: 'record-subtitle' }, dateLabel)), restore);
    }));
    if (!cases.length) list.append(h('li', { class: 'small-empty' }, 'No removed cases.'));
  }
  draw();
  dialog.append(h('div', { class: 'dialog-heading' }, h('h2', { id: 'removed-cases-title' }, 'Removed cases'), close), h('p', { id: 'removed-cases-description', class: 'muted' }, 'These cases are excluded from your local catalog and future builds. Restore a case to return it to the catalog. The live website changes after you rebuild and deploy.'), error, message, list);
  dialog.addEventListener('cancel', (event) => { if (busy) event.preventDefault(); });
  dialog.addEventListener('close', () => dialog.remove(), { once: true });
  document.body.append(dialog); dialog.showModal(); close.focus();
}

async function newContentDialog() {
  if (!mayLeave()) return;
  const dialog = h('dialog', { class: 'folder-dialog', 'aria-labelledby': 'new-content-title' });
  const select = h('select', { id: 'new-content-type' }, ...contentTypes.map(([value, label]) => h('option', { value }, label)));
  if (state.contentGroup === 'expertise') select.value = 'expertise';
  if (state.contentGroup === 'skills') select.value = 'skills';
  const error = h('p', { class: 'field-error', role: 'alert', hidden: true });
  const create = h('button', { type: 'submit', class: 'button button-primary' }, 'Start record', icon('arrow'));
  const form = h('form', { onsubmit: async (event) => {
    event.preventDefault(); create.disabled = true; error.hidden = true;
    try {
      const template = await api.template(select.value);
      if (!contentTypes.some(([collection]) => collection === template.collection)) throw new Error('This record type is not available.');
      selectionRequest++; state.view = 'content'; state.query = ''; state.selectedFile = null; state.dirty = false;
      state.editing = { file: null, collection: template.collection, id: '', sourceHash: null, draftHash: null, isNew: true, body: template.body || '', data: { ...clone(template.data), slug: '', publication_status: 'draft' } };
      dialog.close(); render(); $('#field-slug')?.focus();
    } catch (cause) { error.textContent = cause.message || String(cause); error.hidden = false; }
    finally { create.disabled = false; }
  } }, h('div', { class: 'dialog-heading' }, h('div', {}, h('p', { class: 'eyebrow' }, 'ADD YOUR CONTENT'), h('h2', { id: 'new-content-title' }, 'Start a new record')), button('Close', () => dialog.close(), 'quiet')),
  h('p', { class: 'muted' }, 'Choose what you want to add. A blank form will open with writing prompts and the fields for that record type.'),
  h('div', { class: 'field' }, h('label', { htmlFor: 'new-content-type' }, 'Record type'), select),
  h('p', { class: 'field-hint', style: 'margin-top:14px' }, 'Save incomplete work as a working draft. Required dates and other missing details can be filled in before you apply it.'), error,
  h('div', { class: 'dialog-actions' }, button('Cancel', () => dialog.close()), create));
  dialog.append(form); document.body.append(dialog); dialog.addEventListener('close', () => dialog.remove(), { once: true }); dialog.showModal(); select.focus();
}

async function renderSourceReports(host, editing) {
  const title = h('h3', { class: 'section-title' }, 'Source report · local only');
  if (!editing.file) {
    host.replaceChildren(title, h('p', { class: 'field-hint' }, 'No source report is linked to this new case. Report links stay in the local builder and are never added to the public website.'));
    return;
  }
  host.append(h('p', { class: 'field-hint', role: 'status' }, 'Looking up the source report…'));
  try {
    const result = await api.reports(editing.file);
    if (state.editing !== editing || !host.isConnected) return;
    const reports = (result.reports || []).filter(report => {
      try { const url = new URL(report.url, location.href); return url.origin === location.origin && url.pathname.startsWith('/api/'); } catch { return false; }
    });
    host.replaceChildren(title);
    if (!reports.length) host.append(h('p', { class: 'field-hint' }, 'No available source report is linked to this case. Report links stay in the local builder and are never added to the public website.'));
    for (const report of reports) {
      const format = String(report.format || 'file').toUpperCase();
      host.append(h('div', { class: 'source-report-row' },
        h('a', { class: 'button button-subtle', href: report.url, target: '_blank', rel: 'noopener noreferrer' }, `Open source report (${format})`, h('span', { 'aria-hidden': 'true' }, '↗')),
        h('div', {}, h('span', { class: 'source-report-label' }, report.label || report.path?.split('/').pop() || 'Source report'), report.path && h('p', { class: 'field-hint source-report-path' }, report.path))));
    }
    if (reports.length) host.append(h('p', { class: 'field-hint' }, 'Opens in a new tab. PDFs can be read alongside this form; other formats may download. The report is not included on the public website.'));
    for (const issue of result.issues || []) host.append(h('p', { class: 'field-hint' }, issueMessage(issue)));
  } catch (error) {
    if (state.editing !== editing || !host.isConnected) return;
    host.replaceChildren(title, h('p', { class: 'field-error' }, `The source report could not be loaded: ${error.message || String(error)}`));
  }
}

function categoryFields(editing) {
  const sourceCategories = Array.isArray(editing.sourceData?.categories) ? editing.sourceData.categories : [];
  const sourceIds = new Set(sourceCategories.map((category) => category?.id));
  let rowNumber = 0;
  const rows = (Array.isArray(editing.data.categories) ? editing.data.categories : []).map((category) => ({ key: ++rowNumber, id: String(category?.id || ''), label: String(category?.label || ''), manualId: Boolean(category?.id), locked: sourceIds.has(category?.id) }));
  const list = h('div', { class: 'category-list' });
  const assignedCases = (id) => id ? (state.workspace.records || []).filter((entry) => entry.collection === 'cases' && ((entry.chart === editing.data.slug && entry.category === id) || (entry.draftChart === editing.data.slug && entry.draftCategory === id))).length : 0;
  const draw = () => {
    list.replaceChildren(...rows.map((row, index) => {
      const count = assignedCases(row.id);
      const labelId = `category-${row.key}-label`; const idId = `category-${row.key}-id`;
      const idInput = h('input', { id: idId, type: 'text', value: row.id, readonly: row.locked, autocomplete: 'off', spellcheck: false, placeholder: 'category-id', oninput: (event) => { row.id = event.target.value; row.manualId = true; setDirty(); } });
      const labelInput = h('input', { id: labelId, type: 'text', value: row.label, autocomplete: 'off', placeholder: 'Category name', oninput: (event) => { row.label = event.target.value; if (!row.locked && !row.manualId) { row.id = slugFrom(row.label); idInput.value = row.id; } setDirty(); } });
      const up = button('Move up', () => { [rows[index - 1], rows[index]] = [rows[index], rows[index - 1]]; setDirty(); draw(); });
      up.disabled = index === 0; up.setAttribute('aria-label', `Move category ${index + 1} up`);
      const down = button('Move down', () => { [rows[index + 1], rows[index]] = [rows[index], rows[index + 1]]; setDirty(); draw(); });
      down.disabled = index === rows.length - 1; down.setAttribute('aria-label', `Move category ${index + 1} down`);
      const remove = button('Remove', () => { rows.splice(index, 1); setDirty(); draw(); }, 'danger');
      remove.disabled = count > 0; remove.setAttribute('aria-label', `Remove category ${index + 1}`);
      if (count) remove.title = 'Reassign these cases and apply their changes before removing this category.';
      return h('section', { class: 'category-row', 'aria-label': `Category ${index + 1}` },
        h('div', { class: 'category-row-heading' }, h('h4', {}, `Category ${index + 1}`), badge(`${count} ${count === 1 ? 'case' : 'cases'}`, count ? 'teal' : '')),
        h('div', { class: 'field-grid' },
          h('div', { class: 'field' }, h('label', { htmlFor: labelId }, 'Category label'), labelInput, h('p', { class: 'field-effect' }, h('strong', {}, 'On the website: '), 'The category name in charts, the case explorer, and category-page headings.')),
          h('div', { class: 'field' }, h('label', { htmlFor: idId }, 'Category ID'), idInput, h('p', { class: 'field-effect' }, h('strong', {}, 'Controls: '), 'Case references and the category’s public URL.'), h('p', { class: 'field-hint' }, row.locked ? 'This ID stays fixed so existing case links remain valid.' : 'Generated from the label. You can adjust it before applying.'))),
        h('div', { class: 'category-row-footer' }, count > 0 && h('p', { class: 'field-hint' }, 'Used by applied cases or saved case drafts. Reassign and apply those cases before removal.'), h('div', { class: 'editor-action-group category-actions' }, up, down, remove)));
    }));
    if (!rows.length) list.append(h('p', { class: 'muted' }, 'Add at least one category before applying this group.'));
  };
  draw();
  const add = button('Add category', () => { const row = { key: ++rowNumber, id: '', label: '', manualId: false, locked: false }; rows.push(row); setDirty(); draw(); $(`#category-${row.key}-label`)?.focus(); }, 'subtle', 'plus');
  return { node: h('section', { class: 'form-section' }, h('h3', { class: 'section-title' }, 'Categories'), h('p', { class: 'section-hint' }, 'Labels appear in the case editor and public explorer. Reorder them here, or remove categories with no assigned cases.'), list, add), values: () => rows.map((row) => ({ id: row.id.trim(), label: row.label.trim() })) };
}

function employmentDatesFields(data) {
  let rowNumber = 0;
  const rows = (Array.isArray(data.periods) ? data.periods : []).map((period) => ({ key: ++rowNumber, start: period.start ?? '', end: period.end ?? '', current: period.end === null }));
  let datesUnknown = rows.length === 0 && typeof data.active_position === 'boolean';
  let currentWithoutDates = data.active_position === true || rows.some((period) => period.current);
  if (!rows.length && !datesUnknown) rows.push({ key: ++rowNumber, start: '', end: '', current: false });
  const list = h('div', { class: 'employment-periods' });
  const currentUnknown = h('input', { id: 'employment-current-without-dates', type: 'checkbox', checked: currentWithoutDates, onchange: (event) => { currentWithoutDates = event.target.checked; setDirty(); } });
  const unknownStatus = h('div', { class: 'employment-undated-status' }, h('label', { class: 'checkbox-field', htmlFor: currentUnknown.id }, currentUnknown, 'This is a current role'));
  const add = button('Add employment period', () => {
    const row = { key: ++rowNumber, start: '', end: '', current: false }; rows.push(row); setDirty(); draw(); $(`#employment-${row.key}-start`)?.focus();
  }, 'subtle', 'plus');
  const draw = () => {
    list.hidden = datesUnknown; add.hidden = datesUnknown; unknownStatus.hidden = !datesUnknown;
    list.replaceChildren(...rows.map((row, index) => {
      const startId = `employment-${row.key}-start`; const endId = `employment-${row.key}-end`; const currentId = `employment-${row.key}-current`;
      const start = h('input', { id: startId, type: 'month', value: row.start, oninput: (event) => { row.start = event.target.value; setDirty(); } });
      const end = h('input', { id: endId, type: 'month', value: row.current ? '' : row.end, disabled: row.current, oninput: (event) => { row.end = event.target.value; setDirty(); } });
      const current = h('input', { id: currentId, type: 'checkbox', checked: row.current, onchange: (event) => { row.current = event.target.checked; end.disabled = row.current; end.value = row.current ? '' : row.end; setDirty(); } });
      const remove = button('Remove period', () => { rows.splice(index, 1); setDirty(); draw(); }, 'subtle');
      remove.setAttribute('aria-label', `Remove employment period ${index + 1}`);
      return h('fieldset', { class: 'employment-period' }, h('legend', { class: 'field-label' }, `Employment period ${index + 1}`),
        h('div', { class: 'field-grid' },
          h('div', { class: 'field' }, h('label', { htmlFor: startId }, 'Start month'), start, h('p', { class: 'field-effect' }, h('strong', {}, 'On the website: '), 'The start of this employment period and its career timeline span.')),
          h('div', { class: 'field' }, h('label', { htmlFor: endId }, 'End month'), end, h('p', { class: 'field-effect' }, h('strong', {}, 'On the website: '), 'The last month of this period. Current role uses Present and extends the timeline through the current month.'))),
        h('div', { class: 'employment-period-actions' }, h('label', { class: 'checkbox-field', htmlFor: currentId }, current, 'Current role'), remove));
    }));
    if (!rows.length) list.append(h('p', { class: 'field-hint' }, 'Add a period, or select “Dates are not documented” below.'));
  };
  const unknown = h('input', { id: 'employment-dates-unknown', type: 'checkbox', checked: datesUnknown, onchange: (event) => { datesUnknown = event.target.checked; setDirty(); draw(); } });
  draw();
  return {
    node: h('section', { class: 'form-section' }, h('h3', { class: 'section-title' }, 'Employment dates'),
      h('p', { class: 'section-hint' }, 'These months appear in your public work history. Add separate periods if you returned to this organization after a gap. Select Current role only for an ongoing period.'),
      list, add,
      h('div', { class: 'employment-date-options' }, h('label', { class: 'checkbox-field', htmlFor: unknown.id }, unknown, 'Dates are not documented'), h('p', { class: 'field-effect' }, h('strong', {}, 'On the website: '), 'Undated jobs remain in the work history without an invented timeline span. Current role adds that label.'), unknownStatus)),
    values: () => datesUnknown ? { periods: [], active_position: currentWithoutDates } : { periods: rows.map(({ start, end, current }) => ({ start, end: current ? null : end })) },
  };
}

function recordRowsFields(editing, key, { title, item, fields, hint, reorder = false }) {
  const original = editing.data[key];
  let sequence = 0; let changed = false;
  const rows = (original || []).map(value => ({ ...clone(value), rowKey: ++sequence }));
  const list = h('div', { class: 'record-detail-rows', 'aria-label': title });
  const touch = () => { changed = true; setDirty(); };
  function draw() {
    list.replaceChildren(...rows.map((row, index) => {
      const inputs = fields.map(spec => {
        const id = `record-${key}-${row.rowKey}-${spec.key}`;
        const input = h('input', { id, type: spec.type || 'text', value: row[spec.key] ?? '', oninput: () => { row[spec.key] = input.value.trim() || (spec.nullable ? null : ''); touch(); } });
        return h('div', { class: `field${spec.full ? ' field-full' : ''}` }, h('label', { htmlFor: id }, spec.label), input, spec.hint && h('p', { class: 'field-hint' }, spec.hint));
      });
      const remove = button(`Remove ${item.toLowerCase()}`, () => { rows.splice(index, 1); touch(); draw(); });
      remove.setAttribute('aria-label', `Remove ${item.toLowerCase()} ${index + 1}`);
      const actions = [remove];
      if (reorder) {
        const move = offset => { const target = index + offset; if (target < 0 || target >= rows.length) return; rows.splice(index, 1); rows.splice(target, 0, row); touch(); draw(); };
        const up = button('Move up', () => move(-1)); up.disabled = index === 0; up.setAttribute('aria-label', `Move ${item.toLowerCase()} ${index + 1} up`);
        const down = button('Move down', () => move(1)); down.disabled = index === rows.length - 1; down.setAttribute('aria-label', `Move ${item.toLowerCase()} ${index + 1} down`);
        actions.unshift(up, down);
      }
      return h('fieldset', { class: 'record-detail-row' }, h('legend', { class: 'field-label' }, `${item} ${index + 1}`), h('div', { class: 'field-grid' }, inputs), h('div', { class: 'page-row-actions' }, actions));
    }));
    if (!rows.length) list.append(h('p', { class: 'field-hint' }, `No ${title.toLowerCase()} added.`));
  }
  draw();
  return {
    node: h('section', { class: 'form-section' }, h('h3', { class: 'section-title' }, title), fieldEffect(editing, key), h('p', { class: 'section-hint' }, hint), list,
      button(`Add ${item.toLowerCase()}`, () => {
        const row = Object.fromEntries(fields.map(spec => [spec.key, spec.nullable ? null : ''])); row.rowKey = ++sequence; rows.push(row); touch(); draw(); $(`#record-${key}-${row.rowKey}-${fields[0].key}`)?.focus();
      }, 'subtle', 'plus')),
    value: () => !changed ? original === undefined ? undefined : clone(original) : rows.map(({ rowKey, ...row }) => row),
  };
}

function recordWebsiteUse(editing) {
  const descriptions = {
    profile: 'Your name and headline are shared across pages. Choose each page’s portrait in Pages, and write the biography on the About page. Location stays hidden unless you choose to show it.',
    pages: editing.data.slug === 'home' ? 'The homepage has a fixed layout. Its title is used in browser and sharing previews; your profile supplies the large name heading. The notes below identify each editable part.' : 'This record controls one public page, its search and sharing description, and the content sections it includes. Only selected sections are displayed.',
    experience: 'Employment records appear on pages that select them or include all employment. Dates also feed the career timeline. Location stays hidden unless you choose to show it.',
    education: 'Education entries show the institution, program, study dates, and your description on pages that include them.',
    credentials: 'Credentials appear on pages that select them or include all credentials. The official name, issuer, issue year, description, expiry date, and supplied links are public.',
    contacts: 'Selected contact records supply a page introduction and its contact cards. Enabled email, phone, service, and social details are public.',
    articles: 'When a page includes an Articles section, published articles have their own public page and appear in the writing list. The short description also appears in search and sharing previews.',
    resources: 'Published resources appear in the resource list. Their descriptions, source links, and review dates are public.',
    expertise: 'This is a reusable expertise record. Select it from Pages wherever it belongs. Its title, summary, and detailed text are shared across those pages.',
    projects: 'This description, contribution, and body appear on pages that select this project.',
    interests: 'This description and body appear on pages that select this interest.',
    skills: 'This reusable skill supplies its title, proficiency, and description wherever selected. Assign its group and position separately on each page.',
    activities: 'This activity appears on pages that select it for volunteer work or organizations. Its description and participation details are public.',
    callouts: 'This description and body appear on pages that select this callout.',
  };
  return descriptions[editing.collection] || 'This record appears on pages that select it. Save and review changes before applying them.';
}

function publicBlockKeys(editing) {
  if (editing.collection === 'profile') return ['initials', 'footer_tagline'];
  if (editing.collection === 'experience') return ['organization_short', 'timeline_summary', 'litigation_relevance'];
  if (['education', 'credentials', 'expertise', 'projects', 'interests', 'callouts'].includes(editing.collection)) return ['litigation_relevance'];
  if (editing.collection === 'articles') return ['takeaway'];
  if (editing.collection !== 'pages') return [];
  if (editing.data.slug === 'home' || editing.file === 'content/pages/home.md') return ['hero_statement', 'experience_label', 'expertise_heading', 'project_heading', 'personal_photos_heading', 'personal_photos_intro', 'contact_heading', 'contact_description'];
  const keys = ['eyebrow'];
  for (const section of editing.data.section_order ?? []) {
    if (section === 'page_sections') continue;
    if (section === 'biography') keys.push('bio_eyebrow', 'bio_heading');
    else if (section === 'credentials') keys.push('credentials_heading');
    else if (section === 'charts') keys.push('charts_heading', 'casebook_introduction');
    else if (section === 'articles') keys.push('writing_heading');
    else if (section === 'resources') keys.push(...['first_steps', 'reporting', 'avoid_scams', 'reports'].map((group) => `resources_${group}_heading`));
    else if (section === 'organizations') keys.push('organizations_heading', 'organizations_intro', 'memberships_heading', 'memberships_intro', 'daos_heading', 'daos_intro');
    else if (section === 'contact_cta') keys.push('contact_heading', 'contact_description', 'contact_button_label');
    else keys.push(`${section}_heading`, `${section}_intro`);
  }
  return [...new Set(keys)];
}

// Guidance describes the current renderers; it never changes or infers content.
function websiteFieldHelp(editing, key) {
  const collection = editing.collection;
  const home = collection === 'pages' && (editing.data.slug === 'home' || editing.file === 'content/pages/home.md');
  const publicText = (text) => ({ label: 'On the website', text });
  const setting = (text) => ({ label: 'Controls', text });
  const saved = (text) => ({ label: 'Not displayed', text });
  if (editing.file === 'site.json') return setting({
    url: 'The base address of canonical links and social-sharing URLs. This does not deploy or redirect the site.',
    language: 'The page language declared for browsers and assistive technology. This does not translate your content.',
    locale: 'How dates and numbers are formatted, including currency amounts.',
    'appearance.defaultTheme': 'The initial light or dark appearance. A visitor’s saved theme choice takes precedence.',
    'appearance.particles': 'The animated background across the website.',
  }[key] || 'Site-wide configuration.');
  if (key.startsWith('blocks.')) {
    const block = key.slice(7);
    if (collection === 'cases') return block === 'investigative_question' ? publicText('The highlighted investigative question above the case narrative, also included in case search.') : block === 'chart_label' ? publicText('The case node label in the explorer when a case number is not supplied.') : saved('The current case layout does not display this passage.');
    const closingEnquiry = collection === 'pages' && !home && ['contact_heading', 'contact_description', 'contact_button_label'].includes(block);
    const composablePageText = collection === 'pages' && !home && (
      /^(experience|expertise|projects|education|interests|callouts|skills|volunteering|organizations|memberships|daos|github|personal_photos)_(heading|intro)$/.test(block)
      || /^(bio_eyebrow|bio_heading|credentials_heading|charts_heading|casebook_introduction|writing_heading|resources_(first_steps|reporting|avoid_scams|reports)_heading)$/.test(block));
    if (!publicBlockKeys(editing).includes(block) && !closingEnquiry && !composablePageText) return saved('Kept in the content file; the current layout or selected page sections do not display this passage.');
    const passages = {
      initials: 'The monogram in the header. When blank, initials are derived from your name.',
      footer_tagline: 'The line beneath your name in the footer. When blank, your professional headline is used.',
      organization_short: 'The organization label in the homepage experience strip and career timeline. The full organization name remains in the job entry.',
      timeline_summary: 'The description in the career timeline tooltip. When blank, the job’s short description is used.',
      litigation_relevance: 'A highlighted passage within this record’s details.',
      takeaway: 'The highlighted key takeaway above the article body.',
      hero_statement: 'The prominent statement beneath your name on the homepage.',
      experience_label: 'The label beside the homepage organization strip, when employment records are selected.',
      expertise_heading: home ? 'The heading above the homepage areas of expertise.' : 'The heading above this page’s expertise section.',
      project_heading: 'The heading above the homepage selected projects.',
      contact_heading: home ? 'The heading of the homepage contact invitation, when a Contact page is available.' : 'The heading of this page’s closing enquiry, when that section is included.',
      contact_description: home ? 'The text beneath the homepage contact invitation heading.' : 'The text beneath this page’s closing enquiry heading, when that section is included.',
      contact_button_label: 'The button label in this page’s closing enquiry. Leave blank to use the default label for the selected service.',
      eyebrow: 'The small line above the page title. When blank, the profile name is used.',
      bio_eyebrow: 'The small label above the biography heading.',
      bio_heading: 'The heading beside the biography written on this page.',
      casebook_introduction: 'The introduction above the casebook statistics.',
      charts_heading: 'The heading above the casebook section.',
      writing_heading: 'The heading above the article list.',
    };
    return publicText(passages[block] || (block.endsWith('_intro') ? 'The introduction for this selected section. It appears only when the section has content.' : 'The heading for this selected section. It appears only when the section has content.'));
  }
  if (key === 'description_short') {
    if (collection === 'profile') return saved('Saved for reference; the website uses your headline and biography instead.');
    if (collection === 'contacts') return saved('Saved as the record summary; the current website layout does not display it.');
    if (collection === 'charts') return publicText('The description beneath the investigation-group heading in its chart.');
    if (collection === 'pages') return publicText('The description in page metadata and social-sharing previews, rather than a paragraph in the page.');
    if (collection === 'articles') return publicText('The article-list summary, article introduction, and search and sharing description.');
    if (collection === 'skills') return publicText('The description inside the skill’s expandable Details section.');
    if (collection === 'cases') return publicText('The lead paragraph in the case details and the description used in case search results.');
    return publicText('The summary beneath this record’s heading wherever the record is included.');
  }
  if (key === 'title') return publicText(collection === 'pages'
    ? home ? 'The browser-tab and sharing title. The large homepage heading uses your profile name instead.' : 'The large page heading, browser-tab title, and sharing title. The navigation label is configured separately.'
    : collection === 'cases' ? 'The anonymous description below the case number. Without a case number, it becomes the case heading.'
    : collection === 'charts' ? 'The investigation-group heading, case explorer label, and category-page context.'
    : 'The heading for this record in its public list or details.');
  if (key === 'name') return publicText(collection === 'profile' ? 'Your homepage heading, header, footer, browser and sharing titles, and page text that inserts your shared name.' : 'The credential heading in certification and training lists.');
  if (key === 'location' || key === 'show_location') return collection === 'profile'
    ? setting('Whether the saved location appears beneath your name on the homepage. It stays hidden while Show location on website is unchecked.')
    : setting('Whether the saved location appears beneath the organization in this job’s details. It stays hidden while Show location on website is unchecked.');
  if (key === 'credential_type') return saved(collection === 'education' ? 'The type of study is kept in the local record and does not add a label to the website.' : 'Any existing type is kept in the local record and is not displayed on the website.');
  if (key === 'role') return publicText(collection === 'cases' ? 'The Role line in the case facts.' : collection === 'activities' ? 'Your role beneath the community activity heading.' : 'The job heading and role shown in the career timeline.');
  if (key === 'organization') return publicText(collection === 'activities' ? 'The organization beneath the community activity heading.' : 'The organization in the job entry, homepage experience strip, and career timeline.');
  if (['start', 'end'].includes(key) && collection === 'education') return publicText('The recorded study dates beside the institution. No completion-status label is added.');
  if (key === 'links') return collection === 'profile' || collection === 'pages' || collection === 'contacts' || collection === 'charts'
    ? saved('These record-level links are not rendered. Use a contact card, or a link in visible body text, for a public link.')
    : publicText('Clickable reference links in this record’s details. Both the labels and destinations are public.');
  if (['experience', 'expertise', 'projects', 'credentials', 'education', 'interests', 'callouts', 'charts', 'repositories', 'skills', 'volunteering', 'memberships', 'daos'].includes(key)) {
    if (collection !== 'pages') return saved('A relationship to other records used for content validation; it does not add a public link or page section.');
    if (home) return ['experience', 'expertise', 'projects'].includes(key)
      ? setting('The records included in this homepage section, in the order listed.')
      : saved('The fixed homepage layout does not display this section. It can be used on other pages.');
    return setting('The records included when the corresponding page section is enabled. Listed order is used except where that section has its own sorting.');
  }
  const descriptions = {
    slug: 'The stable record identifier used by references. For pages and articles it also forms the URL; other records can use it in public section links.',
    headline: 'The small professional headline above your name on the homepage, and the default footer tagline.',
    issuer: 'The issuer label or group heading in the credentials section.',
    issued_year: 'The issue year beneath the official credential or program name.',
    institution: 'The institution beside the education entry’s study dates.',
    program: 'The main heading of the education entry.',
    expires_on: 'The Expires date beneath the credential details. A blank value adds no expiry line.',
    course_url: 'The Training program link beneath the credential.',
    verification_url: 'The Verify credential link beneath the credential.',
    display_order: 'Ordering within lists that use this setting; lower numbers appear first. Some sections sort by dates or page selections instead.',
    'social.name': 'An optional name override for the personal contact card. Leave blank to use the page’s selected profile name.',
    'social.title': 'The heading on the personal contact card.',
    'social.enabled': 'Whether the personal contact card appears on pages using this contact record. It also needs a public email, phone number, or social link.',
    'social.email': 'The visible, clickable email address in the enabled personal contact card.',
    'social.description': 'The description in the personal contact card, rather than the page introduction.',
    social: 'The enabled personal contact card: heading, name, description, email, phone number, and social links are public.',
    services_heading: 'The heading above enabled professional contact-service cards.',
    services: collection === 'cases' ? 'The service labels in the case facts and casebook service statistics.' : 'The enabled professional contact cards, their order, descriptions, contact details, links, and booking buttons.',
    editorial_note: 'An editor-only note. It is excluded from the generated website but remains in the source content pack.',
    case_number: 'The case heading in case details, search results, and the case explorer.',
    chart: 'Which investigation group includes this case in its pages, charts, and totals.',
    category: collection === 'resources' ? 'The group in which the resource appears.' : 'The primary category, its category page, and its case count.',
    subcategory: 'The nested classification labels and grouping in the case explorer and case details. An empty path is shown as Unspecified.',
    opened_on: 'The Engaged date in case details, the year in casebook summaries, and case ordering.',
    closed_on: 'The Report issued date in case details.',
    scope_summary: 'The Scope of work paragraph in case details. A blank value omits that section.',
    networks: 'The Networks line, network counts, and network filters in the casebook.',
    assets: 'The Assets line in case details.',
    jurisdictions: 'The Jurisdictions line in case details.',
    off_chain_leads: 'The types of off-chain leads listed in case details; no underlying identifiers are published by this field.',
    'metrics.reported_loss_usd': 'The Reported loss amount in case details and the reported-loss totals in the casebook.',
    'metrics.assets_reviewed_usd': 'The Assets reviewed amount in case details and the assets-reviewed totals in the casebook.',
    'metrics.amount_note': 'The explanation beneath the case facts, next to the transaction-time valuation note.',
    metrics: 'Reported-loss or assets-reviewed amounts in case details and casebook totals; the amount note explains the figures.',
    categories: 'The public category labels and their order in this group. IDs are used in case references and category URLs.',
    portrait: 'The portrait images, optional caption, and slideshow settings for this page. The portrait appears only when enabled for this page. Image source URLs are saved only and are not displayed.',
    badge: 'The credential badge image and its alternative text. Its source URL is saved only and is not displayed.',
    logo: collection === 'education' ? 'The university logo beside this education entry’s heading, on a solid light background in both website themes.' : 'The organization logo beside this job’s heading, on a solid light background in both website themes.',
    periods: collection === 'activities' ? 'The participation dates beneath the activity heading.' : 'The employment dates and spans in the career timeline.',
    active_position: 'Whether a job without documented dates is labeled Current role.',
    highlights: 'The bullet points beneath the job’s short description. Highlight IDs can appear in public section links.',
    contribution: 'The contribution or role line in project details and homepage project previews.',
    group: 'The GitHub group that contains this repository.',
    icon: 'The symbol beside the skill, interest, or community activity heading.',
    proficiency: 'The skill rating and its filled dots or stars. Drafts may leave this blank; a rating is required before publication. Blank ratings are not shown in preview.',
    assessed_on: 'The Self-assessed date inside the skill details.',
    kind: 'Whether the activity is listed as volunteering, a membership, or DAO participation.',
    participation: 'The participation description beneath the activity heading.',
    owner: 'The visible GitHub owner name and the repository-link destination.',
    repository: 'The visible repository name and the GitHub-link destination.',
    show_stats: 'Whether GitHub statistics images appear. When enabled, visitors load those images from the statistics provider.',
    published_on: 'The article publication date in its listing, detail page, and sharing metadata.',
    updated_on: 'The Updated date on the article page and its sharing metadata.',
    tags: 'The topic labels on the article card and article page.',
    related_cases: 'The Related casework links beneath the article.',
    source: 'The resource publisher, author, publication date, and external-link destination.',
    reviewed_on: 'The Link reviewed date at the bottom of the resource card.',
    action_label: 'The text on the resource’s external link.',
    content_kind: 'Whether content is real or illustrative. Examples cannot be included in a published release as real work.',
    profile: 'The shared profile supplying this page’s identity and footer. Portraits and biography text are chosen on this page.',
    biography: 'The biography written for this page. It appears when this page includes its Biography section.',
    page_sections: 'Additional written sections belonging to this page, displayed in their listed order where Written sections is placed.',
    contact: home ? 'The fixed homepage does not display contact cards; it links to the Contact page when available.' : 'The contact cards on this page. A visible contact record also supplies the page introduction from its body.',
    compact_sections: 'Which expertise or project sections use concise previews with expandable details. The original records and other pages stay unchanged.',
    contact_cta: 'The contact record and organization service supplying this page’s closing enquiry. Its current booking, email, or enquiry destination is reused from that source.',
    section_order: home ? 'The homepage uses its fixed layout; this section list does not rearrange it.' : 'Which sections appear on the page, and in which order.',
    navigation: 'The page’s navigation label and position in the header. The Contact page uses a separate, fixed Contact button.',
    experience_source: home ? 'The homepage uses its selected employment records; this setting applies to other pages.' : 'Whether the employment section uses selected records or all visible employment records.',
    credentials_source: 'Whether the credentials section uses selected records or all visible credentials.',
    issuer_order: 'The order of issuer groups within the credentials section.',
    issuer_logos: 'One optional logo beside each issuing-authority heading in this page’s certifications and training section.',
    timeline: 'The career timeline’s start, scale, and layout when the employment section is included.',
    personal_photos: home ? 'The photos and captions above the homepage contact section, in the order listed. This section appears when at least one photo is assigned.' : 'The photos, captions, and alternative text in the Personal photos section, when enabled.',
    github_groups: 'The enabled GitHub group headings, account links, and grouping for selected repositories.',
    skill_symbols: 'Whether skill ratings use dots or stars.',
    skill_groups: 'This page’s skill group headings, group order, and selected skills in their order within each group. Other pages can arrange the same skill records differently.',
    organization_group_order: 'The order of membership and DAO groups in the Organizations section.',
    resource_group_order: 'Which resource groups appear and their order.',
  };
  if (key === 'editorial_note') return saved(descriptions[key]);
  if (home && ['contact', 'compact_sections', 'contact_cta', 'section_order', 'experience_source', 'credentials_source', 'issuer_order', 'issuer_logos', 'timeline', 'github_groups', 'skill_symbols', 'skill_groups', 'organization_group_order', 'resource_group_order'].includes(key)) return saved(key === 'section_order' || key === 'experience_source' || key === 'contact' ? descriptions[key] : 'The fixed homepage layout does not use this setting; it applies to sections on other pages.');
  return descriptions[key] ? publicText(descriptions[key]) : { label: 'Check field use', text: 'No display mapping is available for this field. Saving a field alone does not create a website section.' };
}

function fieldEffect(editing, key, id) {
  const help = websiteFieldHelp(editing, key);
  return h('p', { class: `field-effect${help.label === 'Not displayed' ? ' field-effect-private' : ''}`, id }, h('strong', {}, `${help.label}: `), help.text);
}

function advancedFieldGuide(editing, extra) {
  const keys = Object.keys(extra).flatMap(key => key === 'blocks' && extra.blocks && typeof extra.blocks === 'object' ? Object.keys(extra.blocks).map(block => `blocks.${block}`) : [key]);
  return h('details', { class: 'field-guide' }, h('summary', {}, 'What these fields affect'), h('dl', {}, keys.map(key => h('div', {}, h('dt', {}, h('code', {}, key)), h('dd', {}, fieldEffect(editing, key))))));
}

function contactServicesFields(data) {
  const original = clone(data.services || []);
  let changed = false; let reordered = false; let sequence = 0;
  const rows = original.map((value, index) => ({ value: clone(value), originalIndex: index, key: sequence++, isNew: false }))
    .sort((a, b) => (a.value.display_order ?? 100) - (b.value.display_order ?? 100) || a.value.id.localeCompare(b.value.id));
  const list = h('div', { class: 'contact-card-editor-list' });
  const touch = () => { changed = true; setDirty(); };
  const normalizeOrder = () => { reordered = true; rows.forEach((row, index) => { row.value.display_order = index * 10; }); };
  const uniqueId = (name, row) => {
    const base = slugFrom(name) || 'organization'; let id = base; let suffix = 2;
    while (rows.some(other => other !== row && other.value.id === id)) id = `${base}-${suffix++}`;
    return id;
  };
  function draw() {
    list.replaceChildren();
    if (!rows.length) list.append(h('p', { class: 'field-hint contact-card-editor-empty' }, 'No organization cards yet. Add a card for each organization and the enquiries it handles.'));
    rows.forEach((row, index) => {
      const value = row.value; const prefix = `contact-service-${row.key}`;
      const summary = h('summary', { class: 'contact-card-editor-heading' }, value.name || 'New organization');
      const fields = h('div', { class: 'field-grid contact-card-editor-body' });
      const details = h('details', { class: 'contact-service-details', open: row.isNew || row.open }, summary, fields);
      let visibilityText;
      details.addEventListener('toggle', () => { row.open = details.open; });
      function textField(key, label, options = {}) {
        const parts = key.split('.'); const current = parts.reduce((item, part) => item?.[part], value);
        const input = h(options.multiline ? 'textarea' : 'input', { id: `${prefix}-${key.replaceAll('.', '-')}`, type: options.multiline ? undefined : options.type || 'text', value: current ?? '', rows: options.multiline ? 3 : undefined, placeholder: options.placeholder, autocomplete: 'off', readonly: options.readonly });
        input.addEventListener('input', () => {
          if (options.readonly) return;
          const next = input.value.trim();
          if (parts.length === 1) {
            if (options.optional && !next) delete value[key]; else value[key] = next;
          } else {
            const [parent, child] = parts;
            value[parent] = { ...(value[parent] || {}), [child]: next };
            if (options.optional && !value[parent].label && !value[parent].url && !value[parent].number) delete value[parent];
          }
          if (key === 'id') row.manualId = true;
          if (key === 'name') {
            summary.textContent = next || 'New organization';
            if (visibilityText) visibilityText.textContent = next ? `Show ${next} on website` : 'Show this organization';
            if (row.isNew && !row.manualId) {
              value.id = uniqueId(next, row);
              const idInput = fields.querySelector(`#${prefix}-id`); if (idInput) idInput.value = value.id;
            }
          }
          touch();
        });
        return h('div', { class: `field${options.full ? ' field-full' : ''}` }, h('label', { htmlFor: input.id }, label), input,
          options.hint && h('p', { class: 'field-hint' }, options.hint));
      }
      fields.append(
        textField('name', 'Organization name', { full: true }),
        textField('description', 'Enquiries handled by this organization', { multiline: true, full: true }),
        textField('email', 'Organization email (optional)', { type: 'email', optional: true }),
        textField('phone.label', 'Displayed phone number (optional)', { optional: true }),
        textField('phone.number', 'International phone number (optional)', { optional: true, placeholder: '+19035550123', hint: 'Include the country code, with no spaces. Fill in both phone fields or leave both blank.' }),
        textField('website.label', 'Website link text (optional)', { optional: true }),
        textField('website.url', 'Website address (optional)', { type: 'url', optional: true, hint: 'Fill in both website fields or leave both blank.' }),
        textField('action.label', 'Enquiry button text'),
        textField('action.url', 'Enquiry button destination', { type: 'url', hint: 'A full website address, such as the organization’s enquiry page.' }));
      const bookingEnabled = h('input', { id: `${prefix}-booking-enabled`, type: 'checkbox', checked: value.booking?.enabled !== false && Boolean(value.booking) });
      bookingEnabled.addEventListener('change', () => {
        if (value.booking || bookingEnabled.checked) value.booking = { ...(value.booking || { label: '', url: '' }), enabled: bookingEnabled.checked };
        touch();
      });
      const booking = h('details', { class: 'advanced field-full' }, h('summary', {}, 'Appointment booking (optional)'),
        h('label', { class: 'checkbox-field', htmlFor: bookingEnabled.id }, bookingEnabled, 'Show appointment booking'),
        h('div', { class: 'field-grid' }, textField('booking.label', 'Booking button text'), textField('booking.url', 'Google Calendar appointment schedule URL', { type: 'url', hint: 'Use the full calendar.google.com appointment schedule address.' })));
      booking.addEventListener('input', () => {
        if (value.booking && value.booking.enabled === undefined) value.booking.enabled = bookingEnabled.checked;
        if (value.booking && !value.booking.label && !value.booking.url && !bookingEnabled.checked) delete value.booking;
      });
      fields.append(booking,
        h('details', { class: 'advanced field-full' }, h('summary', {}, 'Card reference'),
          textField('id', 'Card ID', { readonly: !row.isNew, hint: row.isNew ? 'Used by shared values and page links. Choose a unique ID using lowercase words separated by hyphens.' : 'Kept stable so existing shared values and page links continue to work.' })));
      const enabled = h('input', { id: `${prefix}-enabled`, type: 'checkbox', checked: value.enabled !== false, onchange: () => { value.enabled = enabled.checked; touch(); } });
      visibilityText = h('span', {}, value.name ? `Show ${value.name} on website` : 'Show this organization');
      const up = button('Move up', () => { [rows[index - 1], rows[index]] = [rows[index], rows[index - 1]]; normalizeOrder(); touch(); draw(); });
      const down = button('Move down', () => { [rows[index], rows[index + 1]] = [rows[index + 1], rows[index]]; normalizeOrder(); touch(); draw(); });
      up.disabled = index === 0; down.disabled = index === rows.length - 1;
      const remove = button('Remove card', () => {
        if (!window.confirm(`Remove the ${value.name || 'organization'} contact card? This takes effect only after you save and apply the draft.`)) return;
        rows.splice(index, 1); touch(); draw();
      }, 'danger');
      list.append(h('section', { class: 'contact-card-editor', 'aria-label': value.name || 'New organization' },
        h('label', { class: 'checkbox-field', htmlFor: enabled.id }, enabled, visibilityText), details,
        h('div', { class: 'editor-action-group contact-card-editor-actions' }, up, down, remove)));
    });
  }
  const node = h('section', { class: 'form-section' }, h('h3', { class: 'section-title' }, 'Organization contact cards'),
    h('p', { class: 'section-hint' }, 'Choose the organizations visitors can contact. Each visible card shows its enquiry description, public contact details, and enquiry button.'), list,
    button('Add organization card', () => {
      const row = { value: { id: '', name: '', description: '', enabled: true, action: { label: 'Contact organization', url: '' } }, originalIndex: original.length + sequence, key: sequence++, isNew: true };
      row.value.id = uniqueId('', row); rows.push(row); normalizeOrder(); touch(); draw();
      list.lastElementChild?.querySelector('input[id$="-name"]')?.focus();
    }));
  draw();
  return { node, value: () => !changed ? clone(original) : (reordered ? rows : [...rows].sort((a, b) => a.originalIndex - b.originalIndex)).map(row => clone(row.value)) };
}

function pageSectionOrder(editing) {
  return editing.pageComposition?.order() ?? editing.data.section_order ?? [];
}

function setPageSection(editing, name, enabled) {
  if (editing.pageComposition) { editing.pageComposition.setSection(name, enabled); return; }
  const advanced = $('#field-advanced');
  const value = JSON.parse(advanced.value);
  const order = value.section_order ?? pageSectionOrder(editing);
  if (!Array.isArray(order)) throw new Error('Correct the page section list before changing its placement.');
  value.section_order = enabled ? [...new Set([...order, name])] : order.filter(item => item !== name);
  advanced.value = JSON.stringify(value, null, 2); advanced.dispatchEvent(new Event('input', { bubbles: true }));
}

function pageCompositionFields(editing, field, controlled) {
  const home = editing.data.slug === 'home' || editing.file === 'content/pages/home.md';
  const sectionNames = [
    ['biography', 'Biography'], ['experience', 'Work history'], ['expertise', 'Expertise'],
    ['skills', 'Skills'], ['projects', 'Projects'], ['credentials', 'Credentials'],
    ['education', 'Education'], ['interests', 'Interests'], ['callouts', 'Callouts'],
    ['charts', 'Case work'], ['volunteering', 'Volunteer work'], ['organizations', 'Organizations'],
    ['github', 'GitHub repositories'], ['articles', 'Writing'], ['resources', 'Resources'],
    ['personal_photos', 'Photos'], ['page_sections', 'Written sections'], ['contact_cta', 'Closing enquiry'],
  ];
  const definitions = home ? sectionNames.filter(([id]) => ['experience', 'expertise', 'projects', 'personal_photos'].includes(id)) : sectionNames;
  if (home) definitions.sort((a, b) => ['experience', 'expertise', 'projects', 'personal_photos'].indexOf(a[0]) - ['experience', 'expertise', 'projects', 'personal_photos'].indexOf(b[0]));
  let order = [...pageSectionOrder({ ...editing, pageComposition: undefined })];
  const models = new Map(); const rows = new Map(); const blockKeys = new Set(); const changed = new Set();
  const externalStatuses = new Map(); let biographyInput; let advancedSettings = {};
  const sourceStatusReady = (state.workspace.records || []).every(entry => typeof entry.hasSource === 'boolean' && typeof entry.sourceValid === 'boolean');
  const listeners = new Set();
  const enabledList = h('div', { class: 'page-section-list', 'aria-label': home ? 'Homepage slots' : 'Sections on this page' });
  const disabledList = h('div', { class: 'page-section-list page-section-choices' });
  const addSections = h('details', { class: 'page-add-sections' }, h('summary', {}, 'Add a section'), disabledList);
  const node = h('section', { class: 'form-section page-composition' }, h('h3', { class: 'section-title' }, home ? 'Homepage content' : 'Page sections'),
    h('p', { class: 'section-hint' }, home ? 'The homepage uses these fixed positions. Choose records for each slot below; an empty selection hides that slot.' : 'Choose the sections for this page, then move them into order. Open a section to select shared records and edit its headings. The same record can appear on several pages.'),
    h('p', { class: 'field-hint page-section-count-guide' }, 'Record counts use applied library content. Working drafts must be applied before they appear in local previews or published releases. Save and apply page changes to use the selections below.'),
    enabledList, !home && addSections);
  controlled.add('section_order');
  controlled.add('skills'); controlled.add('skill_group_order');
  const touch = (key) => {
    changed.add(key); setDirty(); refreshStatuses();
    const advanced = $('#field-advanced');
    if (!advanced) return;
    try {
      const extra = JSON.parse(advanced.value);
      if (Object.hasOwn(extra, key)) {
        extra[key] = key === 'section_order' ? [...order] : models.get(key)?.value();
        advanced.value = JSON.stringify(extra, null, 2);
      }
    } catch { /* Preserve an incomplete advanced edit until it can be read. */ }
  };
  const sectionText = (key, label, multiline = false) => {
    blockKeys.add(key);
    return field(`blocks.${key}`, label, { full: true, textarea: multiline, optional: true });
  };
  const headings = (id, label) => h('div', { class: 'field-grid page-section-text' },
    sectionText(`${id}_heading`, `${label} heading (optional)`), sectionText(`${id}_intro`, `${label} introduction (optional)`, true));
  const moveButtons = (items, index, update, label) => {
    const up = button('Move up', () => { if (index < 1) return; [items[index - 1], items[index]] = [items[index], items[index - 1]]; update(); });
    const down = button('Move down', () => { if (index >= items.length - 1) return; [items[index], items[index + 1]] = [items[index + 1], items[index]]; update(); });
    up.disabled = index === 0; down.disabled = index === items.length - 1;
    up.setAttribute('aria-label', `Move ${label} up`); down.setAttribute('aria-label', `Move ${label} down`);
    return [up, down];
  };
  function recordStatus(stats, options = {}) {
    const { selected, preview, published, pending, invalid, missing, all } = stats;
    if (!selected && !all) return { text: 'No records selected. This section is hidden on the website.', empty: true };
    if (!sourceStatusReady) return { text: 'Restart the builder to show applied record counts.' };
    if (!preview) {
      const reasons = [pending && `${pending} waiting to be applied`, invalid && `${invalid} invalid`, missing && `${missing} missing`].filter(Boolean);
      return { text: `No applied records available. This section is hidden on the website.${reasons.length ? ` ${reasons.join('; ')}.` : ''}`, empty: true };
    }
    const details = [pending && `${pending} waiting to be applied`, invalid && `${invalid} invalid`, missing && `${missing} missing`].filter(Boolean);
    return { text: `${preview} ${all ? 'library records available in' : 'selected for'} local preview; ${published} published.${published ? '' : ' Hidden in published releases.'}${details.length ? ` ${details.join('; ')}.` : ''}${options.qualifier ? ` ${options.qualifier}` : ''}` };
  }
  function sectionStatus(id) {
    if (!home && !order.includes(id)) return { text: 'Not included on this page.', excluded: true };
    if (externalStatuses.has(id)) return externalStatuses.get(id);
    if (id === 'biography') return String(biographyInput?.value || '').trim()
      ? { text: 'Biography text is ready for this page.' }
      : { text: 'No biography text. This section is hidden on the website.', empty: true };
    if (id === 'page_sections') {
      const written = models.get(id)?.value() || [];
      if (!written.length) return { text: 'No written sections. This section is hidden on the website.', empty: true };
      const incomplete = written.filter(value => !String(value.title || '').trim() || !String(value.body || '').trim()).length;
      return { text: `${written.length} written ${written.length === 1 ? 'section' : 'sections'} for this page.${incomplete ? ` ${incomplete} incomplete; add headings and text before applying.` : ''}`, empty: incomplete === written.length };
    }
    if (id === 'personal_photos') {
      const count = (editing.data.personal_photos || []).filter(photo => String(photo.image || '').trim()).length;
      return count ? { text: `${count} ${count === 1 ? 'photo assigned' : 'photos assigned'} to this page. Image files must be available.` }
        : { text: 'No photos assigned. This section is hidden on the website.', empty: true };
    }
    if (id === 'contact_cta') return editing.data.contact_cta
      ? { text: 'Contact service selected. Visibility depends on its applied contact record and enabled service.' }
      : { text: 'No contact service selected. This section is hidden on the website.', empty: true };
    if (id === 'organizations') {
      const groups = ['memberships', 'daos'].map(key => models.get(key)?.stats());
      const totals = Object.fromEntries(['selected', 'preview', 'published', 'pending', 'invalid', 'missing'].map(key => [key, groups.reduce((sum, group) => sum + (group?.[key] || 0), 0)]));
      return recordStatus(totals, { qualifier: 'Records appear within the membership and DAO groups.' });
    }
    if (id === 'skills') {
      const skills = models.get('skill_groups');
      if (!skills) return { text: 'No skills selected. This section is hidden on the website.', empty: true };
      const stats = skills.stats(); const summary = recordStatus(stats);
      if (!stats.selected) summary.text = 'No skills selected. This section is hidden on the website. Empty groups are kept here.';
      else summary.text += ` ${skills.groupCount()} ${skills.groupCount() === 1 ? 'group' : 'groups'} in page order; empty groups stay hidden.`;
      if (skills.nameIssues()) summary.text += ' Give each group a distinct name before applying.';
      return summary;
    }
    if (id === 'github') {
      const stats = models.get('repositories')?.stats();
      const configured = advancedSettings.github_groups ?? editing.data.github_groups ?? [];
      const groups = Array.isArray(configured) ? configured.filter(group => group?.enabled && group.account) : [];
      if (!groups.length) return { text: 'No enabled GitHub account groups. This section is hidden on the website.', empty: true };
      if (!sourceStatusReady) return { text: 'GitHub groups selected. Restart the builder to show applied repository counts.' };
      return { text: `${groups.length} enabled GitHub ${groups.length === 1 ? 'group' : 'groups'}; ${stats?.preview || 0} applied repositories selected (${stats?.published || 0} published). Repository cards depend on matching groups.` };
    }
    if (id === 'articles') {
      if (!sourceStatusReady) return { text: 'Writing included. Restart the builder to show applied article counts.' };
      const articles = (state.workspace.records || []).filter(entry => entry.collection === 'articles' && entry.hasSource === true && entry.sourceValid === true);
      return { text: `${articles.length} applied ${articles.length === 1 ? 'article' : 'articles'} for local preview; ${articles.filter(entry => entry.publication_status === 'published').length} published. An empty writing list displays a placeholder.` };
    }
    if (id === 'resources') return { text: 'Included. Resource visibility depends on applied records and this page’s selected resource groups.' };
    const stats = models.get(id)?.stats();
    return stats ? recordStatus(stats, { qualifier: id === 'credentials' ? 'Credentials are grouped by issuer.' : '' })
      : { text: 'Included. Visibility depends on this section’s content.' };
  }
  function refreshStatuses() {
    for (const [id, row] of rows) {
      const summary = sectionStatus(id);
      if (row.status.textContent !== summary.text) row.status.textContent = summary.text;
      row.status.classList.toggle('is-empty', Boolean(summary.empty)); row.status.classList.toggle('is-excluded', Boolean(summary.excluded));
    }
  }
  function recordPicker(key, collection, label, kind) {
    controlled.add(key);
    let selected = [...(editing.data[key] || [])];
    let query = ''; let disabled = false;
    const candidates = (state.workspace.records || []).filter(entry => entry.collection === collection && (!kind || !entry.kind || entry.kind === kind));
    const list = h('ol', { class: 'page-selected-records', 'aria-label': `${label} selected for this page` });
    const choice = h('select', { id: `page-record-${key}`, 'aria-label': `Choose ${label.toLowerCase()} record` });
    const search = h('input', { type: 'search', placeholder: `Find ${label.toLowerCase()}…`, 'aria-label': `Find ${label.toLowerCase()}`, oninput: () => { query = search.value; drawChoices(); } });
    const add = button('Add to page', () => { if (!choice.value || selected.includes(choice.value)) return; selected.push(choice.value); touch(key); draw(); });
    const picker = h('div', { class: 'page-record-picker' }, h('p', { class: 'field-label' }, label), list,
      h('div', { class: 'page-record-add' }, search, choice, add),
      h('p', { class: 'field-hint' }, 'Selections belong to this page. Removing a selection keeps the record in its library.'));
    function drawChoices() {
      const available = candidates.filter(entry => !selected.includes(entry.id) && `${recordTitle(entry)} ${entry.id}`.toLowerCase().includes(query.toLowerCase()));
      const previous = choice.value;
      choice.replaceChildren(h('option', { value: '' }, available.length ? 'Choose a record…' : query ? 'No matching records' : 'No more records available'),
        ...available.map(entry => h('option', { value: entry.id }, `${recordTitle(entry)}${entry.hasSource === false ? ' · Working draft (not applied)' : entry.publication_status === 'draft' ? ' · Draft' : ''}`)));
      if (available.some(entry => entry.id === previous)) choice.value = previous;
      choice.disabled = disabled || !available.length;
      search.disabled = disabled;
      add.disabled = disabled || !choice.value;
    }
    choice.addEventListener('change', () => { add.disabled = disabled || !choice.value; });
    function draw() {
      const displayed = disabled ? candidates.map(entry => entry.id) : selected;
      list.replaceChildren(...displayed.map((id, index) => {
        const entry = candidates.find(record => record.id === id);
        const title = entry ? recordTitle(entry) : id;
        const update = () => { touch(key); draw(); };
        const remove = button('Remove', () => { selected.splice(index, 1); update(); });
        remove.setAttribute('aria-label', `Remove ${title} from this page`);
        const actions = [...moveButtons(selected, index, update, title), remove];
        actions.forEach(action => { if (disabled) action.disabled = true; });
        actions.unshift(recordEditButton(editing, () => entry).node);
        const sourceLabel = !entry ? 'Record unavailable · selection kept' : typeof entry.hasSource !== 'boolean' ? 'Shared library record · restart to confirm source status'
          : entry.hasSource === false ? 'Working draft · apply it before it can appear' : entry.sourceValid === false ? 'Applied record needs attention'
          : entry.publication_status === 'draft' ? 'Applied draft · local preview only' : 'Published library record';
        return h('li', { class: 'page-selected-record' }, h('div', {}, h('strong', {}, title), h('span', { class: 'record-subtitle' }, sourceLabel)), h('div', { class: 'page-row-actions' }, actions));
      }));
      if (!displayed.length) list.append(h('li', { class: 'field-hint page-picker-empty' }, disabled ? 'No library records available.' : 'No records selected.'));
      drawChoices(); refreshStatuses();
    }
    const model = {
      node: picker, value: () => changed.has(key) || editing.data[key] !== undefined ? [...selected] : undefined,
      stats() {
        const entries = disabled ? candidates : selected.map(id => candidates.find(entry => entry.id === id));
        const applied = entries.filter(entry => entry?.hasSource === true && entry.sourceValid === true);
        return { selected: entries.length, preview: applied.length, published: applied.filter(entry => entry.publication_status === 'published').length,
          pending: entries.filter(entry => entry?.hasSource === false).length, invalid: entries.filter(entry => entry?.hasSource === true && entry.sourceValid === false).length,
          missing: entries.filter(entry => !entry).length, all: disabled };
      },
      sync(value) { if (Array.isArray(value)) { selected = [...value]; touch(key); draw(); } },
      disabled(value) { disabled = value; picker.classList.toggle('is-disabled', value); draw(); },
    };
    models.set(key, model); draw(); return model;
  }
  function skillGroups() {
    const key = 'skill_groups'; controlled.add(key);
    let sequence = 0;
    const toGroups = value => value.map((group, index) => ({ key: ++sequence, name: String(group.name || ''), skills: [...(Array.isArray(group.skills) ? group.skills : [])], query: '', open: index === 0 }));
    let groups = toGroups(editing.data.skill_groups || []);
    const candidates = (state.workspace.records || []).filter(entry => entry.collection === 'skills');
    const list = h('ol', { class: 'page-skill-groups', 'aria-label': 'Skill groups in page order' });
    const views = new Map();
    const groupName = group => group.name.trim() || `Unnamed group ${groups.indexOf(group) + 1}`;
    const nameKey = name => name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
    const nameIssue = group => !nameKey(group.name) ? 'Enter a name for this group.'
      : groups.some(other => other !== group && nameKey(other.name) === nameKey(group.name)) ? 'Each group on this page needs a distinct name.' : '';
    function stats(ids) {
      const entries = [...new Set(ids)].map(id => candidates.find(entry => entry.id === id));
      const applied = entries.filter(entry => entry?.hasSource === true && entry.sourceValid === true);
      return { selected: entries.length, preview: applied.length, published: applied.filter(entry => entry.publication_status === 'published').length,
        pending: entries.filter(entry => entry?.hasSource === false).length, invalid: entries.filter(entry => entry?.hasSource === true && entry.sourceValid === false).length,
        missing: entries.filter(entry => !entry).length, all: false };
    }
    function orderButtons(items, index, update, label, level) {
      const actions = moveButtons(items, index, update, label);
      actions[0].textContent = `Move ${level} up`; actions[1].textContent = `Move ${level} down`;
      return actions;
    }
    function updateGroupViews() {
      for (const [groupKey, view] of views) {
        const group = groups.find(entry => entry.key === groupKey); if (!group) continue;
        const label = groupName(group);
        view.heading.textContent = `Group ${groups.indexOf(group) + 1} · ${label}`;
        view.node.setAttribute('aria-label', `${label} skill group`);
        view.addLabel.textContent = `Add a skill to ${label}`;
        view.skillsSummary.textContent = `Skills in ${label} (${group.skills.length})`;
        view.selected.setAttribute('aria-label', `Skills within ${label}`);
        view.search.setAttribute('aria-label', `Find a skill for ${label}`);
        view.choice.setAttribute('aria-label', `Choose a skill for ${label}`);
        view.groupMove[0].setAttribute('aria-label', `Move group ${label} up`);
        view.groupMove[1].setAttribute('aria-label', `Move group ${label} down`);
        view.removeGroup.setAttribute('aria-label', `Delete empty skill group ${label}`);
        for (const skill of view.skillActions) {
          skill.move[0].setAttribute('aria-label', `Move ${skill.title} up within ${label}`);
          skill.move[1].setAttribute('aria-label', `Move ${skill.title} down within ${label}`);
          skill.remove.setAttribute('aria-label', `Remove ${skill.title} from ${label} on this page`);
          skill.action.setAttribute('aria-label', `Move ${skill.title} from ${label} to another group`);
        }
        const issue = nameIssue(group);
        view.nameError.textContent = issue; view.nameError.hidden = !issue;
        view.nameInput.setAttribute('aria-invalid', String(Boolean(issue)));
        const summary = recordStatus(stats(group.skills));
        view.status.textContent = summary.text.replaceAll('This section', 'This group');
        view.status.classList.toggle('is-empty', Boolean(summary.empty));
        for (const target of view.targets) {
          const previous = target.select.value;
          const others = groups.filter(entry => entry !== group);
          target.select.replaceChildren(h('option', { value: '' }, others.length ? 'Choose another group…' : 'Add another group to move this skill'),
            ...others.map(entry => h('option', { value: String(entry.key) }, groupName(entry))));
          if (others.some(entry => String(entry.key) === previous)) target.select.value = previous;
          target.select.disabled = !others.length;
          target.action.disabled = !target.select.value;
        }
      }
      refreshStatuses();
    }
    const update = () => { touch(key); draw(); };
    function draw() {
      for (const [groupKey, view] of views) {
        const group = groups.find(entry => entry.key === groupKey);
        if (group) group.open = view.skillsDetails.open;
      }
      views.clear(); list.replaceChildren();
      groups.forEach((group, groupIndex) => {
        const label = groupName(group);
        const heading = h('h4', { class: 'page-skill-group-title' });
        const nameError = h('p', { class: 'field-error', id: `page-skill-group-${group.key}-error`, hidden: true });
        const nameInput = h('input', { type: 'text', id: `page-skill-group-${group.key}-name`, value: group.name, placeholder: 'For example, Investigation',
          'aria-describedby': nameError.id, oninput: () => { group.name = nameInput.value; touch(key); updateGroupViews(); } });
        const status = h('p', { class: 'page-skill-group-status', role: 'status' });
        const selected = h('ol', { class: 'page-group-skills', 'aria-label': `Skills within ${label}` });
        const targets = []; const skillActions = [];
        group.skills.forEach((id, index) => {
          const entry = candidates.find(record => record.id === id);
          const title = entry ? recordTitle(entry) : id;
          const sourceLabel = !entry ? 'Record unavailable · selection kept' : typeof entry.hasSource !== 'boolean' ? 'Shared skill · restart to confirm source status'
            : entry.hasSource === false ? 'Working draft · apply it before it can appear' : entry.sourceValid === false ? 'Applied skill needs attention'
            : entry.publication_status === 'draft' ? 'Applied draft · local preview only' : 'Published library skill';
          const remove = button('Remove from page', () => { group.skills.splice(index, 1); update(); });
          remove.setAttribute('aria-label', `Remove ${title} from ${label} on this page`);
          const move = orderButtons(group.skills, index, update, `${title} within ${label}`, 'skill');
          const select = h('select', { id: `page-skill-${group.key}-${index}-target`, 'aria-label': `Destination group for ${title}` });
          const action = button('Move to group', () => {
            const destination = groups.find(other => String(other.key) === select.value);
            if (!destination || destination === group) return;
            if (destination.skills.includes(id)) throw new Error('This skill is already selected in that group. Remove its duplicate page selection first.');
            group.skills.splice(index, 1); destination.skills.push(id); update();
          });
          select.addEventListener('change', () => { action.disabled = !select.value; });
          targets.push({ select, action });
          skillActions.push({ title, move, remove, action });
          selected.append(h('li', { class: 'page-skill-row' }, h('div', { class: 'page-skill-info' }, h('strong', {}, title), h('span', { class: 'record-subtitle' }, sourceLabel)),
            h('div', { class: 'page-row-actions page-skill-order' }, recordEditButton(editing, () => entry).node, move, remove), h('div', { class: 'page-skill-reassign' }, select, action)));
        });
        if (!group.skills.length) selected.append(h('li', { class: 'field-hint page-picker-empty' }, 'No skills in this group. Empty groups stay hidden on the website.'));
        const addLabel = h('label', { class: 'field-label', htmlFor: `page-skill-group-${group.key}-choice` });
        const choice = h('select', { id: addLabel.htmlFor, 'aria-label': `Choose a skill for ${label}` });
        const search = h('input', { type: 'search', value: group.query, placeholder: 'Find a skill…', 'aria-label': `Find a skill for ${label}`, oninput: () => { group.query = search.value; drawChoices(); } });
        const add = button('Add skill', () => {
          const id = choice.value;
          if (!id || groups.some(entry => entry.skills.includes(id))) return;
          group.skills.push(id); update();
        });
        function drawChoices() {
          const assigned = new Set(groups.flatMap(entry => entry.skills));
          const available = candidates.filter(entry => !assigned.has(entry.id) && `${recordTitle(entry)} ${entry.id}`.toLocaleLowerCase().includes(group.query.toLocaleLowerCase()));
          const previous = choice.value;
          choice.replaceChildren(h('option', { value: '' }, available.length ? 'Choose a skill…' : group.query ? 'No matching unassigned skills' : 'No unassigned skills available'),
            ...available.map(entry => h('option', { value: entry.id }, `${recordTitle(entry)}${entry.hasSource === false ? ' · Working draft (not applied)' : entry.publication_status === 'draft' ? ' · Draft' : ''}`)));
          if (available.some(entry => entry.id === previous)) choice.value = previous;
          choice.disabled = !available.length; add.disabled = !choice.value;
        }
        choice.addEventListener('change', () => { add.disabled = !choice.value; });
        drawChoices();
        const removeGroup = button('Delete empty group', () => { if (group.skills.length) return; groups.splice(groupIndex, 1); update(); }, 'danger');
        removeGroup.disabled = group.skills.length > 0;
        removeGroup.setAttribute('aria-label', `Delete empty skill group ${label}`);
        if (group.skills.length) removeGroup.title = 'Move or remove this group’s page selections before deleting the group.';
        const skillsSummary = h('summary', { class: 'page-skill-group-summary' });
        const skillsDetails = h('details', { class: 'page-skill-group-details', open: group.open }, skillsSummary,
          h('div', { class: 'page-skill-group-body' },
            h('p', { class: 'field-hint page-skill-order-hint' }, 'Skills appear below in their order within this group.'), selected,
            h('div', { class: 'page-skill-add' }, addLabel, h('div', { class: 'page-record-add' }, search, choice, add)),
            h('p', { class: 'field-hint' }, 'A skill can appear once on this page. Move it between groups above. Removing it here keeps its library record.')));
        skillsDetails.addEventListener('toggle', () => { group.open = skillsDetails.open; });
        const groupMove = orderButtons(groups, groupIndex, update, `group ${label}`, 'group');
        const node = h('li', { class: 'page-skill-group' },
          h('div', { class: 'page-skill-group-heading' }, heading, h('div', { class: 'page-row-actions' }, groupMove, removeGroup)),
          h('div', { class: 'field' }, h('label', { htmlFor: nameInput.id }, 'Group name on this page'), nameInput, nameError), status, skillsDetails);
        views.set(group.key, { node, heading, nameInput, nameError, status, targets, addLabel, skillsSummary, skillsDetails, selected, search, choice, groupMove, removeGroup, skillActions }); list.append(node);
      });
      if (!groups.length) list.append(h('li', { class: 'field-hint page-picker-empty' }, 'No skill groups yet. Add a group, then choose the skills that belong in it.'));
      updateGroupViews();
    }
    const model = {
      value: () => changed.has(key) || editing.data[key] !== undefined ? groups.map(group => ({ name: group.name.trim().replace(/\s+/g, ' '), skills: [...group.skills] })) : undefined,
      stats: () => stats(groups.flatMap(group => group.skills)), groupCount: () => groups.length, nameIssues: () => groups.some(group => nameIssue(group)),
      sync(value) { if (Array.isArray(value)) { groups = toGroups(value); touch(key); draw(); } },
    };
    models.set(key, model); draw();
    return h('div', { class: 'page-skill-composer' }, h('p', { class: 'field-hint' }, 'Arrange the groups first, then arrange the skills inside each group. Group names and membership belong to this page; skill content and ratings come from the shared Skills library.'), list,
      button('Add skill group', () => { const group = { key: ++sequence, name: '', skills: [], query: '', open: true }; groups.push(group); update(); $(`#page-skill-group-${group.key}-name`)?.focus(); }, 'subtle', 'plus'));
  }
  function groupOrder(key, label, hint) {
    controlled.add(key);
    let values = [...(editing.data[key] || [])];
    const list = h('ol', { class: 'page-selected-records', 'aria-label': label });
    const name = h('input', { type: 'text', placeholder: 'Exact group name', 'aria-label': `Add to ${label.toLowerCase()}` });
    const add = button('Add group', () => { const value = name.value.trim(); if (!value || values.includes(value)) return; values.push(value); name.value = ''; touch(key); draw(); });
    function draw() {
      list.replaceChildren(...values.map((value, index) => h('li', { class: 'page-selected-record' }, h('strong', {}, value),
        h('div', { class: 'page-row-actions' }, moveButtons(values, index, () => { touch(key); draw(); }, value), button('Remove', () => { values.splice(index, 1); touch(key); draw(); })))));
    }
    const model = { value: () => changed.has(key) || editing.data[key] !== undefined ? [...values] : undefined, sync(value) { if (Array.isArray(value)) { values = [...value]; touch(key); draw(); } } };
    models.set(key, model); draw();
    return h('details', { class: 'page-group-order' }, h('summary', {}, label), h('p', { class: 'field-hint' }, hint), list, h('div', { class: 'page-group-add' }, name, add));
  }
  function sourceChoice(key, label, picker) {
    const source = field(key, label, { value: editing.data[key] || 'selected', choices: [['selected', 'Choose records for this page'], ['all', 'All visible library records']], full: true });
    const select = $('select', source);
    const update = () => picker.disabled(select.value === 'all');
    select.addEventListener('change', update); update();
    return h('div', { class: 'page-section-source' }, source, h('p', { class: 'field-hint' }, 'All records includes future additions to the library. Choose records to control this page’s selection and order.'), picker.node);
  }
  function writtenSections() {
    const key = 'page_sections'; controlled.add(key);
    let sequence = 0;
    let values = (editing.data.page_sections || []).map(value => ({ ...clone(value), key: ++sequence }));
    const list = h('div', { class: 'page-written-sections' });
    const uniqueId = () => { let index = 1; while (values.some(value => value.id === `written-section-${index}`)) index++; return `written-section-${index}`; };
    function draw() {
      list.replaceChildren(...values.map((value, index) => {
        const heading = h('input', { id: `page-written-${value.key}-title`, type: 'text', value: value.title || '', oninput: () => { value.title = heading.value; touch(key); } });
        const body = h('textarea', { id: `page-written-${value.key}-body`, rows: 6, class: 'narrative', value: value.body || '', oninput: () => { value.body = body.value; touch(key); } });
        return h('section', { class: 'page-written-section' }, h('h4', {}, `Written section ${index + 1}`),
          h('div', { class: 'field-grid' },
            h('div', { class: 'field field-full' }, h('label', { htmlFor: heading.id }, 'Section heading'), heading),
            h('div', { class: 'field field-full' }, h('label', { htmlFor: body.id }, 'Section text'), body, h('p', { class: 'field-hint' }, 'Text for this page only. Markdown headings, lists, and links are supported.'))),
          h('div', { class: 'page-row-actions' }, moveButtons(values, index, () => { touch(key); draw(); }, `written section ${index + 1}`), button('Remove section', () => { values.splice(index, 1); touch(key); draw(); })));
      }));
      if (!values.length) list.append(h('p', { class: 'field-hint' }, 'Add a written section for an approach, supporting information, or a closing passage.'));
      refreshStatuses();
    }
    const model = {
      value: () => changed.has(key) || editing.data[key] !== undefined ? values.map(({ key: rowKey, ...value }) => ({ ...value, title: value.title.trim(), body: value.body.trim() })) : undefined,
      sync(value) { if (Array.isArray(value)) { values = value.map(value => ({ ...clone(value), key: ++sequence })); touch(key); draw(); } },
    };
    models.set(key, model); draw();
    return h('div', {}, h('p', { class: 'field-hint' }, 'These sections belong to this page. Keep this group at the bottom for text beneath work history or case work, or move the group elsewhere in Page sections.'), list,
      button('Add written section', () => { const value = { id: uniqueId(), title: '', body: '', key: ++sequence }; values.push(value); touch(key); setSection('page_sections', true); draw(); $(`#page-written-${value.key}-title`)?.focus(); }, 'subtle', 'plus'));
  }
  for (const [id, label] of definitions) {
    const content = h('div', { class: 'page-section-content' });
    let hint = 'Shared records and page text';
    if (id === 'biography') {
      content.append(h('div', { class: 'field-grid' }, sectionText('bio_eyebrow', 'Biography label (optional)'), sectionText('bio_heading', 'Biography heading (optional)'),
        field('biography', 'Biography on this page', { full: true, textarea: true, narrative: true, rows: 10, optional: true, hint: 'This biography belongs to this page. Plain text and Markdown are supported.' })));
      biographyInput = $('textarea', content); biographyInput.addEventListener('input', refreshStatuses);
      hint = 'Written on this page';
    } else if (id === 'page_sections') { content.append(writtenSections()); hint = 'Headings and text written on this page'; }
    else if (id === 'personal_photos') { content.append(h('p', { class: 'field-hint' }, 'Choose photos, captions, and the photo section heading in Photos on this page below.')); hint = 'Page photos and captions'; }
    else if (id === 'contact_cta') { content.append(h('p', { class: 'field-hint' }, 'Choose the organization service and invitation text in Closing enquiry below.')); hint = 'Page invitation using shared contact details'; }
    else if (id === 'organizations') {
      content.append(headings(id, label), headings('memberships', 'Memberships'), recordPicker('memberships', 'activities', 'Memberships', 'memberships').node,
        headings('daos', 'DAO participation'), recordPicker('daos', 'activities', 'DAO participation', 'daos').node);
    } else if (id === 'github') {
      content.append(headings(id, label), recordPicker('repositories', 'repositories', 'Repositories').node,
        h('p', { class: 'field-hint' }, 'Repository groups and GitHub accounts use this page’s existing GitHub configuration, available under Additional page settings.'));
    } else if (id === 'articles') {
      content.append(h('div', { class: 'field-grid' }, sectionText('writing_heading', 'Writing heading (optional)')), h('p', { class: 'field-hint' }, 'Includes visible articles from the writing library, ordered by publication date.')); hint = 'Visible articles from the library';
    } else if (id === 'resources') {
      content.append(h('div', { class: 'field-grid' }, ['first_steps', 'reporting', 'avoid_scams', 'reports'].map(group => sectionText(`resources_${group}_heading`, `${group.replaceAll('_', ' ')} heading (optional)`))), h('p', { class: 'field-hint' }, 'Includes visible resources in this page’s selected groups. Manage group selection under Additional page settings.')); hint = 'Visible resources from the library';
    } else if (id === 'skills') {
      content.append(headings(id, label), h('div', { class: 'field-grid' }, field('skill_symbols', 'Rating symbols', { value: editing.data.skill_symbols || 'dots', choices: [['dots', 'Dots'], ['stars', 'Stars']], full: true })), skillGroups()); hint = 'Page-owned groups with ordered shared skills';
    } else {
      const collection = id === 'volunteering' ? 'activities' : id;
      const picker = recordPicker(id, collection, label, id === 'volunteering' ? id : undefined);
      if (home) {
        const headingKey = { experience: 'experience_label', expertise: 'expertise_heading', projects: 'project_heading' }[id];
        content.append(h('div', { class: 'field-grid' }, sectionText(headingKey, `${label} heading (optional)`)), picker.node);
      } else {
        if (id === 'credentials') content.append(h('div', { class: 'field-grid' }, sectionText('credentials_heading', 'Credentials heading (optional)')));
        else if (id === 'charts') content.append(h('div', { class: 'field-grid' }, sectionText('charts_heading', 'Case work heading (optional)'), sectionText('casebook_introduction', 'Case work introduction (optional)', true)));
        else content.append(headings(id, label));
        content.append(['experience', 'credentials'].includes(id) ? sourceChoice(`${id}_source`, `${label} source`, picker) : picker.node);
        if (id === 'credentials') content.append(groupOrder('issuer_order', 'Issuing authority order', 'Credentials are grouped by issuer. Add the exact issuer names and move them into order. Unlisted issuers follow alphabetically.'));
      }
    }
    const checkbox = h('input', { id: `page-section-${id}`, type: 'checkbox', checked: order.includes(id), onchange: () => setSection(id, checkbox.checked) });
    const actions = h('div', { class: 'page-row-actions' });
    const status = h('p', { class: 'page-section-status', id: `page-section-status-${id}`, role: 'status' });
    checkbox.setAttribute('aria-describedby', status.id);
    const details = h('details', { class: 'page-section-details', open: id === 'biography' || id === 'page_sections' }, h('summary', {}, 'Edit section content'), content);
    const row = h('section', { class: 'page-section-row', 'aria-label': `${label} section` },
      h('div', { class: 'page-section-heading' }, home ? h('div', { class: 'page-section-label' }, h('strong', {}, label), h('span', { class: 'field-hint' }, hint)) : h('label', { class: 'checkbox-field page-section-label', htmlFor: checkbox.id }, checkbox, h('span', {}, h('strong', {}, label), h('span', { class: 'field-hint' }, hint))), actions), status, details);
    rows.set(id, { node: row, checkbox, actions, details, status });
  }
  function draw() {
    if (home) { enabledList.replaceChildren(...definitions.map(([id]) => rows.get(id).node)); refreshStatuses(); return; }
    enabledList.replaceChildren(); disabledList.replaceChildren();
    for (const id of order) {
      const row = rows.get(id); if (!row) continue;
      row.checkbox.checked = true; row.details.hidden = false; row.actions.replaceChildren(...moveButtons(order, order.indexOf(id), () => { touch('section_order'); draw(); listeners.forEach(listener => listener()); }, definitions.find(([key]) => key === id)[1]));
      row.node.classList.add('is-included'); enabledList.append(row.node);
    }
    for (const [id] of definitions.filter(([id]) => !order.includes(id))) {
      const row = rows.get(id); row.checkbox.checked = false; row.details.hidden = true; row.actions.replaceChildren(); row.node.classList.remove('is-included'); disabledList.append(row.node);
    }
    if (!order.length) enabledList.append(h('p', { class: 'field-hint' }, 'No sections selected. This page displays its introduction and any contact cards.'));
    refreshStatuses();
  }
  function setSection(id, enabled) {
    if (home) return;
    order = enabled ? [...new Set([...order, id])] : order.filter(value => value !== id);
    touch('section_order'); draw(); listeners.forEach(listener => listener());
  }
  draw();
  return {
    node, blockKeys, order: () => [...order], setSection, subscribe: (listener) => listeners.add(listener),
    setContentStatus(id, summary) { externalStatuses.set(id, summary); refreshStatuses(); },
    values: () => Object.fromEntries([['section_order', home && editing.data.section_order === undefined ? undefined : [...order]], ...[...models].map(([key, model]) => [key, model.value()])]),
    syncFromAdvanced(value) {
      advancedSettings = value;
      if (!home && Array.isArray(value.section_order)) { order = [...value.section_order]; touch('section_order'); draw(); listeners.forEach(listener => listener()); }
      for (const [key, model] of models) if (Object.hasOwn(value, key)) model.sync(value[key]);
      refreshStatuses();
    },
  };
}

function pagePresentationFields(editing, contactTextFields = []) {
  const workspaceId = state.workspaceId;
  const originalCompact = editing.data.compact_sections;
  const originalContact = editing.data.contact_cta;
  let compact = [...(originalCompact || [])];
  let compactChanged = false; let contactChanged = false; let loading = 0; let loaded = false;
  let contactId = originalContact?.contact || ''; let serviceId = originalContact?.service || '';
  let contacts = []; let available = [];
  const touch = () => { contactChanged = true; setDirty(); };
  const active = () => node.isConnected && state.workspaceId === workspaceId;
  const compactInputs = ['expertise', 'projects'].map((name) => {
    const input = h('input', { id: `compact-${name}`, type: 'checkbox', checked: compact.includes(name), onchange: () => {
      compact = input.checked ? [...new Set([...compact, name])] : compact.filter((item) => item !== name);
      compactChanged = true; setDirty();
    } });
    return h('div', { class: 'field field-full' }, h('label', { class: 'checkbox-field', htmlFor: input.id }, input, `Use compact ${name === 'expertise' ? 'expertise' : 'project'} previews`));
  });
  const status = h('p', { class: 'field-hint', role: 'status' });
  const included = h('input', { id: 'closing-enquiry-included', type: 'checkbox', checked: pageSectionOrder(editing).includes('contact_cta'), onchange: () => {
    const next = included.checked;
    try {
      setPlacement(next);
      if (next && !contactId && available.length) { contactId = available[0].id; serviceId = available[0].services[0].id; }
      touch(); draw();
    } catch (error) { included.checked = !next; notify(error.message || 'Correct Page composition before changing enquiry placement.', true); }
  } });
  const source = h('select', { id: 'closing-enquiry-contact', onchange: () => {
    contactId = source.value;
    serviceId = available.find((entry) => entry.id === contactId)?.services[0]?.id || '';
    touch(); draw();
  } });
  const editContact = recordEditButton(editing, () => (state.workspace.records || []).find(record => record.collection === 'contacts' && record.id === contactId));
  const service = h('select', { id: 'closing-enquiry-service', onchange: () => { serviceId = service.value; touch(); draw(); } });
  const selections = h('div', { class: 'field-grid' },
    h('div', { class: 'field' }, h('label', { htmlFor: source.id }, 'Enquiry contact record'), source, h('div', { class: 'page-row-actions' }, editContact.node)),
    h('div', { class: 'field' }, h('label', { htmlFor: service.id }, 'Organization service'), service));
  const node = h('div', { class: 'page-presentation-fields' },
    h('section', { class: 'form-section' }, h('h3', { class: 'section-title' }, 'Page presentation'),
      h('p', { class: 'field-effect' }, h('strong', {}, 'On the website: '), 'Compact previews keep titles, summaries, and links visible while placing longer text under Read more. This applies only to the selected sections on this page.'),
      h('div', { class: 'field-grid' }, compactInputs)),
    h('section', { class: 'form-section' }, h('h3', { class: 'section-title' }, 'Closing enquiry'),
      h('p', { class: 'field-effect' }, h('strong', {}, 'On the website: '), 'A closing invitation reuses one organization service’s applied contact details. It does not add contact cards or replace this page’s introduction.'),
      h('label', { class: 'checkbox-field', htmlFor: included.id }, included, 'Include a closing enquiry section'),
      h('p', { class: 'field-hint' }, 'Enabling adds it at the end. Change its position in Page composition if needed. The destination uses the service’s enabled booking link, then email, then enquiry link.'),
      selections, status, button('Refresh contact choices', load),
      h('div', { class: 'field-grid' }, contactTextFields)));
  function setPlacement(show) {
    setPageSection(editing, 'contact_cta', show);
  }
  function draw() {
    editContact.update();
    const sourceChoices = available.map((entry) => h('option', { value: entry.id, selected: entry.id === contactId }, entry.title));
    if (contactId && !available.some((entry) => entry.id === contactId)) {
      const found = contacts.find((entry) => entry.id === contactId);
      sourceChoices.push(h('option', { value: contactId, selected: true }, `${found?.title || contactId} (${found ? 'unavailable for this page' : 'missing record'})`));
    }
    if (!sourceChoices.length) sourceChoices.push(h('option', { value: '' }, loaded ? 'No organization contacts available' : 'Loading contact records…'));
    source.replaceChildren(...sourceChoices);
    if (!contactId) source.selectedIndex = -1;
    const services = available.find((entry) => entry.id === contactId)?.services || [];
    const serviceChoices = services.map((entry) => h('option', { value: entry.id, selected: entry.id === serviceId }, entry.name));
    if (serviceId && !services.some((entry) => entry.id === serviceId)) {
      const found = contacts.find((entry) => entry.id === contactId)?.data.services?.find((entry) => entry.id === serviceId);
      serviceChoices.push(h('option', { value: serviceId, selected: true }, `${found?.name || serviceId} (${found?.enabled === false ? 'disabled' : 'unavailable'})`));
    }
    if (!serviceChoices.length) serviceChoices.push(h('option', { value: '' }, loaded ? 'No enabled organization services' : 'Loading services…'));
    service.replaceChildren(...serviceChoices);
    if (!serviceId) service.selectedIndex = -1;
    included.disabled = (!loaded && !originalContact) || (loaded && !available.length && !originalContact && !included.checked);
    source.disabled = !included.checked || !loaded || !available.length;
    service.disabled = !included.checked || !loaded || !services.length;
    selections.hidden = !included.checked;
    publishSectionStatus();
    if (!loaded) return;
    if (!available.length && !originalContact) status.textContent = 'Add or enable an organization card under Profile & contact before adding a closing enquiry. Published pages need a published contact record.';
    else if (!included.checked) status.textContent = 'No closing enquiry is displayed. Enable the section to choose its contact source.';
    else if (!available.some((entry) => entry.id === contactId) || !services.some((entry) => entry.id === serviceId)) status.textContent = 'The saved contact or service is unavailable. Choose an available source and service, or remove the closing enquiry.';
    else status.textContent = 'The website reuses the applied service details. Changes to an email address or destination belong in its contact record.';
  }
  function publishSectionStatus() {
    let summary;
    const sourceRecord = (state.workspace.records || []).find(entry => entry.collection === 'contacts' && entry.id === contactId);
    const contact = contacts.find(entry => entry.id === contactId);
    const chosen = contact?.data.services?.find(entry => entry.id === serviceId);
    if (!contactId || !serviceId) summary = { text: 'No contact service selected. This section is hidden on the website.', empty: true };
    else if (!loaded) summary = { text: 'Checking the applied contact service…' };
    else if (sourceRecord && typeof sourceRecord.hasSource !== 'boolean') summary = { text: 'Contact service selected. Restart the builder to confirm its applied source status.' };
    else if (sourceRecord?.hasSource === false) summary = { text: 'The contact source is a working draft. Apply it before this section can appear.', empty: true };
    else if (!sourceRecord?.sourceValid || !contact) summary = { text: 'The selected contact source is unavailable or needs attention. An applied contact record is required.', empty: true };
    else if (!chosen || chosen.enabled === false) summary = { text: 'The selected contact service is unavailable or disabled. This section is hidden on the website.', empty: true };
    else if (!(chosen.booking?.enabled && chosen.booking.url) && !chosen.email && !chosen.action?.url) summary = { text: 'No contact destination available. This section is hidden on the website.', empty: true };
    else summary = { text: contact.data.publication_status === 'published' ? 'Contact service ready for local preview and published releases.' : 'Contact service ready for local preview only; its contact record is an applied draft.' };
    editing.pageComposition?.setContentStatus('contact_cta', summary);
  }
  async function load() {
    const requestId = ++loading;
    status.textContent = 'Loading applied contact records…';
    const records = (state.workspace.records || []).filter((record) => record.collection === 'contacts');
    const results = await Promise.allSettled(records.map(async (record) => ({ id: record.id, title: record.title || record.id, data: (await api.record(record.file)).data })));
    if (!active() || requestId !== loading) return;
    contacts = results.filter((result) => result.status === 'fulfilled').map((result) => result.value);
    available = contacts.filter((entry) => editing.data.publication_status !== 'published' || entry.data.publication_status === 'published')
      .map((entry) => ({ ...entry, services: (entry.data.services || []).filter((item) => item.enabled !== false) })).filter((entry) => entry.services.length);
    if (contactChanged && included.checked && !contactId && available.length) { contactId = available[0].id; serviceId = available[0].services[0].id; }
    loaded = true; draw();
    if (results.some((result) => result.status === 'rejected')) status.textContent += ' Some contact records could not be loaded. Refresh to retry; saved choices have been kept.';
  }
  const syncPlacement = () => {
    const next = pageSectionOrder(editing).includes('contact_cta');
    if (next !== included.checked) {
      included.checked = next; contactChanged = true;
      if (next && !contactId && available.length) { contactId = available[0].id; serviceId = available[0].services[0].id; }
    }
    draw();
  };
  editing.pageComposition?.subscribe(syncPlacement);
  draw(); queueMicrotask(load);
  return {
    node,
    syncFromAdvanced() { syncPlacement(); },
    compactValue: () => compactChanged ? compact : originalCompact === undefined ? undefined : clone(originalCompact),
    contactValue() {
      if (!contactChanged) return originalContact === undefined ? undefined : clone(originalContact);
      if (!included.checked) return undefined;
      if (!available.some((entry) => entry.id === contactId && entry.services.some((item) => item.id === serviceId))) throw new Error('Choose an available contact record and enabled organization service for the closing enquiry, or turn that section off.');
      return { contact: contactId, service: serviceId };
    },
  };
}

function issuerLogoFields(editing) {
  const workspaceId = state.workspaceId;
  const original = editing.data.issuer_logos;
  const key = (issuer) => String(issuer).trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
  const rows = (original || []).map((entry) => clone(entry));
  const list = h('div', { class: 'issuer-logo-list' });
  const status = h('p', { class: 'field-hint', role: 'status' });
  let assets = []; let changed = false; let loading = 0;
  const active = () => node.isConnected && state.workspaceId === workspaceId;
  const touch = () => { changed = true; setDirty(); };
  const node = h('section', { class: 'form-section issuer-logo-fields' },
    h('h3', { class: 'section-title' }, 'Issuing authority logos'),
    h('p', { class: 'field-effect' }, h('strong', {}, 'On the website: '), 'An optional logo appears beside each issuing authority heading in this page’s certifications and training section.'),
    h('p', { class: 'field-hint' }, 'Choose a local organization image or upload one. Removing an assignment keeps its image file.'), list,
    h('div', { class: 'issuer-logo-actions' }, button('Refresh issuers and images', load)), status);
  async function preview(row, image, message) {
    const file = row.image;
    if (!file) return;
    try {
      const blob = await api.asset(`assets/organizations/${file}`);
      if (!active() || !image.isConnected || row.image !== file) return;
      const url = URL.createObjectURL(blob);
      image.onload = () => URL.revokeObjectURL(url);
      image.onerror = () => { URL.revokeObjectURL(url); image.hidden = true; message.textContent = 'This logo could not be displayed.'; };
      image.src = url; image.hidden = false;
    } catch (error) { if (active() && message.isConnected && row.image === file) message.textContent = error.message; }
  }
  function draw() {
    list.replaceChildren(...rows.map((row, index) => {
      const image = h('img', { class: 'issuer-logo-preview', alt: row.alt || '', hidden: true });
      const message = h('p', { class: 'field-hint', role: 'status' });
      const choices = [h('option', { value: '', selected: !row.image }, 'No logo'), ...assets.map((asset) => h('option', { value: asset.name, selected: asset.name === row.image }, asset.name))];
      if (row.image && !assets.some((asset) => asset.name === row.image)) choices.push(h('option', { value: row.image, selected: true }, `${row.image} (not in the image list)`));
      const select = h('select', { id: `issuer-logo-${index}-file`, onchange: () => {
        row.image = select.value;
        if (row.image && !row.alt) row.alt = `${row.issuer} logo`;
        touch(); draw();
      } }, choices);
      const alt = h('input', { type: 'text', id: `issuer-logo-${index}-alt`, value: row.alt || '', disabled: !row.image, oninput: () => { row.alt = alt.value; image.alt = alt.value; touch(); } });
      const remove = button('Remove logo assignment', () => { row.image = ''; row.alt = ''; touch(); draw(); });
      remove.disabled = !row.image;
      const upload = button('Upload logo', () => renderAssetDialog({ kind: 'organization', onSaved: async (asset) => {
        if (!active() || !rows.includes(row)) return;
        row.image = asset.name; if (!row.alt) row.alt = `${row.issuer} logo`;
        touch(); draw(); await load();
      } }));
      const result = h('section', { class: 'issuer-logo-row', 'aria-label': `${row.issuer} logo` },
        h('h4', {}, row.issuer), image,
        h('div', { class: 'field-grid' },
          h('div', { class: 'field' }, h('label', { htmlFor: select.id }, 'Local logo image'), select),
          h('div', { class: 'field' }, h('label', { htmlFor: alt.id }, 'Logo description (alternative text)'), alt)),
        h('div', { class: 'issuer-logo-actions' }, upload, remove), message);
      queueMicrotask(() => preview(row, image, message));
      return result;
    }));
    if (!rows.length) list.append(h('p', { class: 'field-hint' }, 'No issuing authorities are selected for this page. Choose credential records in Page composition, save them, then refresh this list.'));
  }
  async function load() {
    const requestId = ++loading;
    status.textContent = 'Loading issuing authorities and local logos…';
    try {
      const page = editing.data;
      const selected = new Set(page.credentials || []);
      const records = (state.workspace.records || []).filter((record) => record.collection === 'credentials' && (page.credentials_source === 'all' || selected.has(record.id)));
      const [images, results] = await Promise.all([api.assets(), Promise.allSettled(records.map((record) => api.record(record.file)))]);
      if (!active() || requestId !== loading) return;
      assets = images.assets.filter((asset) => asset.kind === 'organization');
      const seen = new Set();
      for (const result of results) {
        if (result.status !== 'fulfilled') continue;
        const data = result.value.data;
        if (page.publication_status === 'published' && data.publication_status !== 'published') continue;
        if (!data.issuer) continue;
        const issuer = data.issuer.trim().replace(/\s+/g, ' '); const issuerKey = key(issuer);
        seen.add(issuerKey);
        if (!rows.some((row) => key(row.issuer) === issuerKey)) rows.push({ issuer, image: '', alt: '' });
      }
      for (let index = rows.length - 1; index >= 0; index--) if (!rows[index].image && !seen.has(key(rows[index].issuer))) rows.splice(index, 1);
      const order = new Map((page.issuer_order || []).map((issuer, index) => [key(issuer), index]));
      rows.sort((a, b) => (order.get(key(a.issuer)) ?? Infinity) - (order.get(key(b.issuer)) ?? Infinity) || a.issuer.localeCompare(b.issuer));
      draw();
      const failures = results.filter((result) => result.status === 'rejected').length;
      status.textContent = failures ? `${failures} credential ${failures === 1 ? 'record could' : 'records could'} not be loaded. Existing logo assignments have been kept.` : 'Issuing authorities come from applied credential records. Save and apply credential changes, then refresh this list.';
    } catch (error) { if (active() && requestId === loading) status.textContent = `Issuing authorities and logos could not be loaded: ${error.message}`; }
  }
  draw(); queueMicrotask(load);
  return { node, value: () => !changed ? original === undefined ? undefined : clone(original) : rows.filter((row) => row.image).map((row) => ({ issuer: row.issuer, image: row.image, alt: row.alt.trim() })) };
}

function sharedPageValues(editing, controls) {
  const workspaceId = state.workspaceId;
  const targets = [...controls].filter(([key]) => (['title', 'description_short', 'biography', '$body'].includes(key) || key.startsWith('blocks.')) && !(key === '$body' && editing.file?.endsWith('.mdx')));
  const destination = h('select', { id: 'shared-value-destination' }, targets.map(([key, { input }]) =>
    h('option', { value: key, selected: key === '$body' }, document.querySelector(`label[for="${input.id}"]`)?.textContent || key)));
  const values = h('select', { id: 'shared-value-choice', disabled: true });
  const preview = h('p', { class: 'field-hint', role: 'status' });
  const status = h('p', { class: 'field-hint', role: 'status' });
  let options = [];
  const insert = button('Insert shared value', () => {
    const choice = options.find(({ token }) => token === values.value);
    const input = controls.get(destination.value)?.input;
    if (!choice || !input) return;
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? start;
    input.setRangeText(choice.token, start, end, 'end');
    input.dispatchEvent(new Event('input', { bubbles: true })); input.focus();
  }, 'subtle');
  insert.disabled = true;
  const showValue = () => { preview.textContent = options.find(({ token }) => token === values.value)?.value || ''; };
  values.addEventListener('change', showValue);
  targets.forEach(([key, { input }]) => input.addEventListener('focus', () => { destination.value = key; }));
  const section = h('details', { class: 'shared-values-tools' }, h('summary', {}, 'Insert shared value'),
    h('p', { class: 'field-hint' }, 'Reuse your profile name, headline, or a public contact detail. The reference stays linked to its source and updates the next time you preview or build the website.'),
    h('div', { class: 'field-grid' },
      h('div', { class: 'field' }, h('label', { htmlFor: values.id }, 'Value to reuse'), values),
      h('div', { class: 'field' }, h('label', { htmlFor: destination.id }, 'Insert into'), destination)),
    preview, h('div', { class: 'editor-action-group' }, insert, button('Reload shared values', load)), status);
  async function load() {
    values.disabled = true; insert.disabled = true; status.textContent = 'Loading shared values…';
    try {
      let page = editing.data;
      try { page = { ...page, ...JSON.parse(controls.get('$advanced').input.value) }; } catch { /* Keep the saved source selection while JSON is being edited. */ }
      if (controls.has('profile')) page = { ...page, profile: controls.get('profile').input.value };
      const sources = state.workspace.records.filter(record => (record.collection === 'profile' && record.id === page.profile) || record.collection === 'contacts');
      const results = await Promise.all(sources.map(async record => ({ record, document: await api.record(record.file) })));
      if (!section.isConnected || state.workspaceId !== workspaceId) return;
      options = [];
      const add = (token, label, value) => { if (typeof value === 'string' && value.trim()) options.push({ token: `{{${token}}}`, label, value }); };
      for (const { record, document: source } of results) {
        const data = source.data;
        if (page.publication_status === 'published' && data.publication_status !== 'published') continue;
        if (record.collection === 'profile') {
          add('profile.name', 'Profile · Name', data.name);
          add('profile.headline', 'Profile · Professional headline', data.headline);
          if (data.show_location === true) add('profile.location', 'Profile · Public location', data.location);
        } else {
          const prefix = `contact.${data.slug}`;
          if (data.social?.enabled !== false) {
            add(`${prefix}.email`, `${record.id} · Personal email`, data.social?.email);
            add(`${prefix}.phone`, `${record.id} · Personal phone`, data.social?.phone?.label);
          }
          for (const service of data.services || []) {
            if (service.enabled === false) continue;
            const servicePrefix = `${prefix}.service.${service.id}`;
            add(`${servicePrefix}.name`, `${service.name} · Organization name`, service.name);
            add(`${servicePrefix}.email`, `${service.name} · Email`, service.email);
            add(`${servicePrefix}.phone`, `${service.name} · Phone`, service.phone?.label);
            add(`${servicePrefix}.website`, `${service.name} · Website`, service.website?.url);
          }
        }
      }
      const selected = values.value;
      values.replaceChildren(...options.map(({ token, label }) => h('option', { value: token, selected: token === selected }, label)));
      values.disabled = !options.length; insert.disabled = !options.length; showValue();
      status.textContent = options.length ? 'Values come from applied profile and contact records. Save and apply changes to a source record, then reload this list.' : 'No public values are available. Select a profile for this page or add public contact details under Profile & contact.';
    } catch (error) { if (section.isConnected) status.textContent = `Shared values could not be loaded: ${error.message}`; }
  }
  queueMicrotask(load);
  return section;
}

function photoFields(editing, textFields = [], options = {}) {
  const portrait = options.portrait === true;
  const personal = editing.collection === 'pages' && !portrait;
  const university = editing.collection === 'education';
  const organization = editing.collection === 'experience' || university;
  const kind = portrait ? 'portrait' : personal ? 'personal' : organization ? 'organization' : 'credential';
  const key = portrait ? 'portrait' : personal ? 'personal_photos' : organization ? 'logo' : 'badge';
  const folder = portrait ? 'assets' : personal ? 'assets/images/personal' : organization ? 'assets/organizations' : 'assets/credentials';
  const original = editing.data[key];
  const source = portrait ? original?.images : personal ? original : original ? [original] : [];
  const rows = (source || []).map((photo) => clone(photo));
  const home = editing.collection === 'pages' && (editing.data.slug === 'home' || editing.file === 'content/pages/home.md');
  let changed = false; let assets = []; let portraitVisibilityChosen = original !== undefined;
  const change = () => { changed = true; setDirty(); updatePortraitState(); publishPhotoStatus(); };
  const list = h('div', { class: 'photo-list' });
  const status = h('p', { class: 'field-hint', role: 'status' });
  const section = h('section', { class: `form-section photo-fields${portrait ? ' page-portrait-fields' : ''}`, id: portrait ? 'page-portrait-fields' : personal ? 'page-personal-photos-fields' : undefined }, h('h3', { class: 'section-title' }, portrait ? 'Page portrait' : personal ? 'Photos on this page' : university ? 'University logo' : organization ? 'Organization logo' : 'Credential badge'),
    h('p', { class: 'field-effect' }, h('strong', {}, 'On the website: '), portrait ? 'These images appear beside this page’s introduction. Choose a different portrait for each page, or add several images to rotate through them.' : personal ? home ? 'These additional photos and captions appear above the homepage contact section, in the order below. Choose the portrait beside your introduction in Page portrait above.' : 'These local images appear in this page’s Personal photos section, in the order below.' : university ? 'This logo appears beside the education heading on a solid light tile. The full image is shown without cropping.' : organization ? 'This logo appears beside the job heading on a solid light tile in the work history. The full image is shown without cropping.' : 'This local image appears beside the credential in its public details.'),
    textFields.length > 0 && h('div', { class: 'field-grid photo-section-text' }, textFields),
    h('p', { class: 'field-hint photo-folder' }, 'Image folder: ', h('code', {}, `${state.workspace.dataDir}/${folder}/`)),
    h('p', { class: 'field-hint' }, 'Choose a local file or upload one below. Source URLs are saved references only; the website uses the local image.'), list, status);
  const autoplay = h('input', { type: 'checkbox', id: 'portrait-autoplay', checked: original?.autoplay ?? true, onchange: change });
  const interval = h('input', { type: 'number', id: 'portrait-interval', min: 2, max: 60, step: 1, value: (original?.interval_ms ?? 6000) / 1000, oninput: change });
  const portraitEnabled = h('input', { type: 'checkbox', id: 'page-portrait-enabled', checked: Boolean(original) && original.enabled !== false, onchange: () => { portraitVisibilityChosen = true; change(); } });
  const portraitCaption = h('input', { type: 'text', id: 'page-portrait-caption', value: original?.caption || '', oninput: change });
  const portraitHint = h('p', { class: 'field-hint page-portrait-visibility', role: 'status' });
  const portraitWarning = h('p', { class: 'field-error page-portrait-warning', role: 'status', hidden: true }, 'Choose or upload at least one portrait before applying this page.');
  const slideshow = h('div', { class: 'photo-slideshow page-portrait-slideshow' }, h('label', { class: 'checkbox-field', htmlFor: autoplay.id }, autoplay, 'Automatically rotate multiple portraits'), h('div', { class: 'field' }, h('label', { htmlFor: interval.id }, 'Seconds between portraits'), interval, h('p', { class: 'field-hint' }, 'Choose an interval from 2 to 60 seconds.')));
  if (portrait) section.insertBefore(h('div', { class: 'page-portrait-visibility-controls' }, h('label', { class: 'checkbox-field', htmlFor: portraitEnabled.id }, portraitEnabled, 'Show a portrait on this page'), portraitHint, portraitWarning), list);
  const enabled = h('input', { type: 'checkbox', id: 'personal-photos-enabled', checked: pageSectionOrder(editing).includes('personal_photos'), onchange: () => {
    try {
      setPageSection(editing, 'personal_photos', enabled.checked);
    } catch (error) { enabled.checked = !enabled.checked; notify(error.message || 'Correct Page composition before changing photo placement.', true); }
  } });
  if (personal && !home) section.insertBefore(h('label', { class: 'checkbox-field photo-placement', htmlFor: enabled.id }, enabled, 'Include the Personal photos section on this page'), list);
  async function preview(photo, image, message) {
    image.hidden = true; image.removeAttribute('src');
    const file = photo.image;
    if (!file) { message.textContent = 'Choose a local image to preview it.'; return; }
    message.textContent = 'Loading local image…';
    try {
      const blob = await api.asset(`${folder}/${file}`);
      if (!image.isConnected || photo.image !== file) return;
      const url = URL.createObjectURL(blob);
      image.onload = () => { URL.revokeObjectURL(url); message.textContent = ''; };
      image.onerror = () => { URL.revokeObjectURL(url); image.hidden = true; message.textContent = 'This image could not be displayed.'; };
      image.src = url; image.hidden = false;
    } catch (error) { if (message.isConnected && photo.image === file) message.textContent = error.message; }
  }
  function draw() {
    list.replaceChildren(...rows.map((photo, index) => {
      const image = h('img', { class: `photo-preview${organization ? ' organization-logo-preview' : ''}`, alt: photo.alt || '', hidden: true });
      const previewMessage = h('p', { class: 'field-hint', role: 'status' });
      const choices = [h('option', { value: '' }, 'Choose a local image…'), ...assets.map(asset => h('option', { value: asset.name, selected: asset.name === photo.image }, asset.name))];
      if (photo.image && !assets.some(asset => asset.name === photo.image)) choices.push(h('option', { value: photo.image, selected: true }, `${photo.image} (not in the image list)`));
      const select = h('select', { id: `photo-${key}-${index}-file`, onchange: () => { if (photo.image !== select.value) delete photo.source_url; photo.image = select.value; change(); draw(); } }, choices);
      const alt = h('input', { id: `photo-${key}-${index}-alt`, type: 'text', value: photo.alt || '', oninput: (event) => { photo.alt = event.target.value; image.alt = photo.alt; change(); } });
      const fields = [h('div', { class: 'field field-full' }, h('label', { htmlFor: select.id }, 'Local image file'), select, h('p', { class: 'field-hint photo-folder' }, `${folder}/${photo.image || 'your-image.jpg'}`)),
        h('div', { class: 'field field-full' }, h('label', { htmlFor: alt.id }, 'Image description (alternative text)'), alt, h('p', { class: 'field-hint' }, 'Describes the actual picture for visitors using screen readers. This text is public.'))];
      if (personal) {
        const caption = h('input', { id: `photo-${key}-${index}-caption`, type: 'text', value: photo.caption || '', oninput: (event) => { photo.caption = event.target.value; change(); } });
        fields.push(h('div', { class: 'field field-full' }, h('label', { htmlFor: caption.id }, 'Caption'), caption, h('p', { class: 'field-hint' }, 'Appears beneath this picture.')));
      }
      const up = button('Move up', () => { [rows[index - 1], rows[index]] = [rows[index], rows[index - 1]]; change(); draw(); }); up.disabled = index === 0;
      const down = button('Move down', () => { [rows[index + 1], rows[index]] = [rows[index], rows[index + 1]]; change(); draw(); }); down.disabled = index === rows.length - 1;
      const row = h('div', { class: 'photo-row' }, h('div', { class: 'photo-preview-frame' }, image, previewMessage), h('div', { class: 'photo-fields-copy' }, h('h4', {}, portrait || personal ? `Photo ${index + 1}` : organization ? 'Logo image' : 'Badge image'), h('div', { class: 'field-grid' }, fields),
        photo.source_url && h('p', { class: 'field-hint photo-folder' }, 'Original source (reference only): ', photo.source_url),
        h('div', { class: 'editor-action-group photo-actions' }, button('Upload replacement', () => renderAssetDialog({ kind, onSaved: async (asset) => { if (!section.isConnected) return; delete photo.source_url; photo.image = asset.name; change(); await loadAssets(); } })), rows.length > 1 && [up, down], button(editing.collection === 'pages' ? 'Remove from page' : 'Remove from record', () => { rows.splice(index, 1); change(); draw(); }, 'subtle'))));
      queueMicrotask(() => preview(photo, image, previewMessage));
      return row;
    }));
    if (!rows.length) list.append(h('p', { class: 'field-hint' }, 'No image assigned. Add one from the local image folder, or upload a new file.'));
    add.hidden = !portrait && !personal && rows.length > 0;
    uploadNew.hidden = !portrait && !personal && rows.length > 0;
    updatePortraitState();
    publishPhotoStatus();
  }
  function updatePortraitState() {
    if (!portrait) return;
    portraitHint.textContent = portraitEnabled.checked ? 'This page uses the portraits assigned below. Other pages keep their own selections.' : 'No portrait is shown on this page. Assigned images and slideshow settings are kept for later.';
    portraitWarning.hidden = !portraitEnabled.checked || rows.some(photo => String(photo.image || '').trim());
    slideshow.hidden = rows.length < 2;
  }
  function publishPhotoStatus() {
    if (!personal) return;
    const count = rows.filter(photo => String(photo.image || '').trim()).length;
    const incomplete = rows.length - count;
    editing.pageComposition?.setContentStatus('personal_photos', count
      ? { text: `${count} ${count === 1 ? 'photo assigned' : 'photos assigned'} to this page. Image files must be available.${incomplete ? ` ${incomplete} ${incomplete === 1 ? 'entry needs' : 'entries need'} an image.` : ''}` }
      : { text: 'No photos assigned. This section is hidden on the website.', empty: true });
  }
  const includeFirstPortrait = () => { if (portrait && !portraitVisibilityChosen) portraitEnabled.checked = true; };
  const add = button(portrait ? 'Add portrait' : personal ? 'Add photo' : organization ? 'Choose logo' : 'Add badge', () => { rows.push({ image: '', alt: '', ...(personal ? { caption: '' } : {}) }); includeFirstPortrait(); change(); draw(); });
  const uploadNew = button(organization ? 'Upload logo' : 'Upload and add image', () => renderAssetDialog({ kind, onSaved: async (asset) => { if (!section.isConnected) return; rows.push({ image: asset.name, alt: '', ...(personal ? { caption: '' } : {}) }); includeFirstPortrait(); change(); await loadAssets(); } }));
  section.append(h('div', { class: 'editor-action-group photo-actions' }, add, uploadNew, button('Refresh image list', loadAssets)), h('p', { class: 'field-hint' }, `Removing an image from this ${editing.collection === 'pages' ? 'page' : 'record'} keeps the file. Save and review changes to apply assignments.`));
  if (portrait) section.append(h('div', { class: 'field page-portrait-caption' }, h('label', { htmlFor: portraitCaption.id }, 'Portrait caption (optional)'), portraitCaption, h('p', { class: 'field-hint' }, 'Appears beneath this page’s portrait. Leave blank for no caption.')), slideshow,
    h('p', { class: 'field-hint' }, 'Add more than one portrait for automatic rotation. The website shows no photo controls. Pages with the same photos in the same order continue the sequence as visitors navigate.'));
  async function loadAssets() {
    status.textContent = 'Loading local image list…';
    try { const result = await api.assets(); if (!section.isConnected) return; assets = result.assets.filter(asset => asset.kind === kind); status.textContent = `${assets.length} local ${assets.length === 1 ? 'image' : 'images'} available.`; draw(); }
    catch (error) { if (section.isConnected) status.textContent = error.message; }
  }
  const syncPlacement = () => { if (personal && !home) enabled.checked = pageSectionOrder(editing).includes('personal_photos'); publishPhotoStatus(); };
  editing.pageComposition?.subscribe(syncPlacement);
  draw(); queueMicrotask(loadAssets);
  return { key, node: section, syncFromAdvanced: syncPlacement, value: () => {
    if (!changed) return original === undefined ? undefined : clone(original);
    const images = rows.map(photo => ({ ...photo, image: String(photo.image ?? '').trim(), alt: String(photo.alt ?? '').trim(), ...(personal ? { caption: String(photo.caption ?? '').trim() } : {}) }));
    if (personal) return images;
    if (portrait) {
      const value = { ...original, enabled: portraitEnabled.checked, images, autoplay: autoplay.checked, interval_ms: Number(interval.value) * 1000 };
      if (portraitCaption.value.trim()) value.caption = portraitCaption.value.trim(); else delete value.caption;
      return value;
    }
    if (!images.length) return undefined;
    return images[0];
  } };
}

function renderEditor() {
  const host = $('#record-editor'); const editing = state.editing; if (!host || !editing) return;
  const data = editing.data; const controls = new Map(); const controlled = new Set(); const offChainLeadInputs = new Map(); const jurisdictionInputs = new Map(); const structuredForms = new Map();
  const form = h('form', { id: 'record-form', onsubmit: (event) => { event.preventDefault(); perform(() => saveForm()); } });
  host.replaceChildren(form);
  const titleActions = h('div', { class: 'editor-title-actions' }, badge(editing.hadDraft ? 'Working draft' : data.publication_status === 'published' ? 'Published' : 'Draft', editing.hadDraft ? 'gold' : data.publication_status === 'published' ? 'teal' : ''));
  if (editing.collection === 'cases' && editing.file && !editing.isNew) {
    const remove = button('Remove case', () => openRemoveCase(editing), 'danger');
    remove.id = 'remove-case'; remove.disabled = Boolean(editing.hadDraft || state.dirty);
    if (remove.disabled) remove.title = 'Apply or discard your content changes before removing this case.';
    titleActions.append(remove);
  }
  form.append(h('div', { class: 'editor-title-row' }, h('div', {}, h('h2', {}, editing.file === 'site.json' ? 'Site settings' : editing.isNew && !editing.file ? `New ${friendlyCollection(editing.collection).toLowerCase()}` : recordTitle(editing)), h('div', { class: 'editor-path' }, editing.file || 'New record · saved to your private working drafts')), titleActions));
  const field = (key, label, options = {}) => {
    controlled.add(key.split('.')[0]);
    const id = `field-${key.replaceAll('.', '-')}`; let input;
    const original = key.split('.').reduce((value, part) => value?.[part], data);
    const value = options.value ?? original ?? '';
    if (options.checkbox) input = h('input', { id, type: 'checkbox', checked: value === true });
    else if (options.choices) input = h('select', { id, onchange: options.onchange }, ...options.choices.map((choice) => { const item = Array.isArray(choice) ? choice : [choice, choice]; return h('option', { value: item[0], selected: String(item[0]) === String(value) }, item[1]); }));
    else if (options.textarea) input = h('textarea', { id, value: Array.isArray(value) ? value.join(', ') : value, rows: options.rows || 3, class: options.narrative ? 'narrative' : '', placeholder: options.placeholder || '', spellcheck: options.spellcheck !== false });
    else input = h('input', { id, type: options.type || 'text', value: options.list && Array.isArray(value) ? value.join(options.path ? ' / ' : ', ') : value, placeholder: options.placeholder || '', readonly: options.readonly, min: options.min, max: options.max, step: options.step, autocomplete: 'off', spellcheck: options.spellcheck || false });
    input.addEventListener('input', setDirty); if (input.tagName === 'SELECT' || options.checkbox) input.addEventListener('change', setDirty);
    controls.set(key, { input, ...options });
    const effectId = `${id}-effect`; const hintId = `${id}-hint`;
    input.setAttribute('aria-describedby', [effectId, options.hint && hintId].filter(Boolean).join(' '));
    const help = [fieldEffect(editing, key, effectId), options.hint && h('p', { class: 'field-hint', id: hintId }, options.hint)];
    if (options.checkbox) return h('div', { class: `field${options.full ? ' field-full' : ''}` }, h('label', { class: 'checkbox-field', htmlFor: id }, input, label), help);
    return h('div', { class: `field${options.full ? ' field-full' : ''}` }, h('label', { htmlFor: id }, label), input, help);
  };
  const section = (title, fields, hint) => h('section', { class: 'form-section' }, h('h3', { class: 'section-title' }, title), hint && h('p', { class: 'section-hint' }, hint), h('div', { class: 'field-grid' }, fields));
  const isSettings = editing.file === 'site.json'; const isCase = editing.collection === 'cases'; const isChart = editing.collection === 'charts'; let categoryForm; let employmentDatesForm; let photoForm; let pagePortraitForm; let contactServiceForm; let issuerLogoForm; let pagePresentationForm; let pageCompositionForm;
  if (editing.collection === 'skills') controlled.add('group');
  const savedSourceFields = [];
  if (isSettings) {
    form.append(section('Website settings', [field('url', 'Website address', { full: true, placeholder: 'https://your-website.example' }), field('language', 'Content language', { value: data.language || 'en' }), field('locale', 'Date and number format', { value: data.locale || 'en-US' }), field('appearance.defaultTheme', 'Initial theme', { value: data.appearance?.defaultTheme || 'dark', choices: [['dark', 'Dark'], ['light', 'Light']] }), field('appearance.particles', 'Background animation', { value: String(data.appearance?.particles ?? true), choices: [['true', 'Enabled'], ['false', 'Disabled']] })], 'These settings apply only to this investigator. They do not publish the website.'));
  } else if (isChart) {
    form.append(section('Investigation group', [field('title', 'Group title', { full: true }), field('description_short', 'Group description', { full: true, textarea: true })]));
    controlled.add('categories'); categoryForm = categoryFields(editing); form.append(categoryForm.node);
  } else if (isCase) {
    const reports = h('section', { class: 'source-reports', 'aria-label': 'Source reports' }, h('h3', { class: 'section-title' }, 'Source report · local only'));
    form.insertBefore(reports, form.children[1] || null);
    renderSourceReports(reports, editing);
    const filenameInput = h('input', { id: 'case-filename', type: 'text', value: editing.file?.split('/').pop() || (data.slug ? `${data.slug}.md` : ''), placeholder: '10-557.md', autocomplete: 'off', spellcheck: false });
    const filenameHint = h('p', { id: 'rename-case-hint', class: 'field-hint' }, editing.file ? editing.hadDraft ? 'Apply or discard the saved working draft before renaming this file.' : 'Rename the Markdown file independently of the report’s case number. Existing website links and report associations are preserved.' : 'Use the report case number, for example 10-557.md. You can change the filename before saving.');
    const filenameRow = h('div', { class: 'filename-row' }, filenameInput);
    if (editing.file) {
      const rename = button('Rename file', async () => {
        if (state.dirty || editing.hadDraft) throw new Error('Apply or discard your content changes before renaming this file.');
        const renamed = await api.rename(editing.file, filenameInput.value.trim(), editing.sourceHash, editing.draftHash ?? null);
        await refreshState(); await selectRecord(renamed.file);
        notify('Case file renamed. Its case number and content were preserved.');
      });
      rename.id = 'rename-case-file'; rename.disabled = Boolean(editing.hadDraft || state.dirty); filenameRow.append(rename);
    } else {
      controls.set('$filename', { input: filenameInput });
      filenameInput.addEventListener('input', () => { filenameInput.dataset.manual = 'true'; setDirty(); });
    }
    const caseFileSection = section('Case file', h('div', { class: 'field field-full' }, h('label', { htmlFor: 'case-filename' }, 'Case filename'), filenameRow, h('p', { class: 'field-effect field-effect-private' }, h('strong', {}, 'Local file: '), 'An existing file rename does not change its public case number, heading, or links. For a new case, this also establishes its identifier, which can appear in public links.'), filenameHint));
    form.append(caseFileSection);
    const charts = state.workspace.charts || []; const chosenChart = charts.find((chart) => chart.id === data.chart);
    const categories = chosenChart?.categories || [];
    const chartChoices = charts.map((chart) => [chart.id, chart.title || chart.id]); if (data.chart && !charts.some((chart) => chart.id === data.chart)) chartChoices.push([data.chart, data.chart]);
    const categoryChoices = categories.map((category) => [category.id, category.label || category.id]); if (data.category && !categories.some((category) => category.id === data.category)) categoryChoices.push([data.category, data.category]);
    form.append(section('Case summary', [field('case_number', 'Case number', { full: true, optional: true, placeholder: 'Number printed on the report cover', hint: 'Use the report’s case number. Leave blank if it is not available; do not use a client or victim name.' }), field('title', 'Public description', { full: true, placeholder: 'A brief, anonymized description of the work', hint: 'Describes the investigation without identifying the people involved.' }), field('description_short', 'Summary', { full: true, textarea: true, placeholder: 'The investigative question, approach, and main finding.' })]));
    let updateCaseContext = () => {};
    form.append(section('Classification & dates', [field('chart', 'Investigation group', { choices: chartChoices, onchange: () => { const selected = charts.find((chart) => chart.id === controls.get('chart').input.value); const category = controls.get('category').input; category.replaceChildren(...(selected?.categories || []).map((item) => h('option', { value: item.id }, item.label || item.id))); updateCaseContext(); } }), field('category', 'Primary category', { choices: categoryChoices }), field('subcategory', 'Classification path', { full: true, list: true, path: true, placeholder: 'investment-platform / fake-exchange', hint: 'Optional. Separate each level with a slash, from broad to specific.' }), field('role', 'Your role', { placeholder: 'Investigator', optional: true, full: true }), field('opened_on', 'Engagement date', { type: 'date', nullable: true, hint: 'The date of engagement recorded in the report introduction.' }), field('closed_on', 'Report issue date', { type: 'date', nullable: true, hint: 'The issue date on the report cover.' })]));
    const scopeField = field('scope_summary', 'Work commissioned (optional)', { value: data.scope_summary || '', full: true, textarea: true, optional: true, placeholder: 'Describe the work commissioned, the assets or transfers examined, and the relevant period.' });
    const scopeHint = h('p', { class: 'field-hint' }); scopeField.append(scopeHint);
    controlled.add('jurisdictions');
    const selectedJurisdictions = new Set(Array.isArray(data.jurisdictions) ? data.jurisdictions : []);
    const jurisdictionOptions = new Map((state.workspace.jurisdictionOptions || []).map(({ value, label }) => [value, label]));
    for (const value of selectedJurisdictions) if (!jurisdictionOptions.has(value)) jurisdictionOptions.set(value, value);
    const jurisdictionStatus = h('p', { class: 'field-hint', id: 'jurisdiction-status', role: 'status', 'aria-atomic': 'true' });
    const jurisdictionEmpty = h('p', { class: 'field-hint jurisdiction-empty', hidden: true }, 'No matching jurisdictions. Try another search.');
    let filterJurisdictions = () => {};
    const jurisdictionChoices = [...jurisdictionOptions].sort(([leftValue, leftLabel], [rightValue, rightLabel]) => Number(selectedJurisdictions.has(rightValue)) - Number(selectedJurisdictions.has(leftValue)) || leftLabel.localeCompare(rightLabel)).map(([value, label], index) => {
      const input = h('input', { id: `jurisdiction-choice-${index}`, type: 'checkbox', value, checked: selectedJurisdictions.has(value), onchange: () => { setDirty(); filterJurisdictions(); } });
      jurisdictionInputs.set(value, input);
      return { node: h('label', { class: 'checkbox-field jurisdiction-option', htmlFor: input.id }, input, label), searchText: `${label} ${value}`.toLocaleLowerCase() };
    });
    const jurisdictionSearch = h('input', { id: 'jurisdiction-search', type: 'search', autocomplete: 'off', placeholder: 'Search countries or territories', 'aria-controls': 'jurisdiction-options', oninput: () => filterJurisdictions() });
    filterJurisdictions = () => {
      const query = jurisdictionSearch.value.trim().toLocaleLowerCase();
      let visible = 0;
      for (const choice of jurisdictionChoices) { choice.node.hidden = !choice.searchText.includes(query); if (!choice.node.hidden) visible++; }
      const selected = [...jurisdictionInputs.values()].filter((input) => input.checked).length;
      jurisdictionStatus.textContent = `${selected} selected${query ? ` · ${visible} matching` : ''}`;
      jurisdictionEmpty.hidden = visible > 0;
    };
    filterJurisdictions();
    const jurisdictionsField = h('fieldset', { class: 'field field-full jurisdiction-field', 'aria-describedby': 'jurisdiction-hint' },
      h('legend', { class: 'field-label' }, 'Jurisdictions'),
      fieldEffect(editing, 'jurisdictions'),
      h('p', { class: 'field-hint', id: 'jurisdiction-hint' }, 'Optional. Select all countries or territories involved in the work. You can choose more than one; leave out identifying locations.'),
      h('label', { class: 'sr-only', htmlFor: 'jurisdiction-search' }, 'Search jurisdictions'), jurisdictionSearch,
      jurisdictionStatus,
      h('div', { class: 'jurisdiction-options', id: 'jurisdiction-options' }, jurisdictionChoices.map(({ node }) => node), jurisdictionEmpty));
    form.append(section('Scope of work', [scopeField, field('networks', 'Networks involved in the investigation', { list: true, placeholder: 'bitcoin, ethereum', hint: 'Optional. Networks relevant to the work, including those established during investigation. Separate entries with commas.' }), field('assets', 'Assets involved in the investigation', { list: true, placeholder: 'BTC, ETH, USDT', hint: 'Optional. Asset names or symbols, separated by commas. These need not be stolen funds.' }), jurisdictionsField]));
    controlled.add('off_chain_leads');
    const selectedLeadTypes = new Set(Array.isArray(data.off_chain_leads) ? data.off_chain_leads : []);
    const leadChoices = (state.workspace.offChainLeadTypes || []).map(({ id, label }) => {
      const input = h('input', { type: 'checkbox', value: id, checked: selectedLeadTypes.has(id), onchange: setDirty });
      offChainLeadInputs.set(id, input);
      return h('label', { class: 'checkbox-field' }, input, label);
    });
    leadChoices.push(h('label', { class: 'checkbox-field' }, h('input', { type: 'checkbox', checked: false, disabled: true }), 'CipherBait — not implemented'));
    form.append(h('section', { class: 'form-section' },
      h('h3', { id: 'off-chain-leads-title', class: 'section-title' }, 'Off-chain leads · optional'),
      h('p', { class: 'section-hint' }, 'Select the types of off-chain leads included in this investigation. Only these types appear in the public summary; do not enter actual addresses, account names, or other identifiers.'),
      h('div', { class: 'check-grid', role: 'group', 'aria-labelledby': 'off-chain-leads-title' }, leadChoices)));
    const lossField = field('metrics.reported_loss_usd', 'Reported loss (USD)', { type: 'number', min: '0', step: 'any', numeric: true });
    const assetsField = field('metrics.assets_reviewed_usd', 'Assets in scope (USD)', { type: 'number', min: '0', step: 'any', numeric: true });
    let amountNote = data.metrics?.amount_note || '';
    if (data.metrics?.valuation_date) {
      const previousDate = `Previously recorded valuation date: ${data.metrics.valuation_date}.`;
      if (!amountNote.includes(previousDate)) amountNote = [amountNote, previousDate].filter(Boolean).join('\n\n');
    }
    const figuresTitle = h('h3', { class: 'section-title' });
    form.append(h('section', { class: 'form-section' }, figuresTitle, h('p', { class: 'section-hint' }, 'Optional, public figures only. USD amounts use values at the time of the transactions unless another basis is explained below. A reported amount does not imply recovery.'), h('div', { class: 'field-grid' }, lossField, assetsField, field('metrics.amount_note', 'Amount source & limitations (optional)', { value: amountNote, textarea: true, optional: true, full: true, placeholder: 'Values at the time of the transactions are assumed. If a different valuation basis or date was used, explain it here, along with any source limitations.' }))));
    updateCaseContext = () => {
      const criminal = controls.get('chart').input.value === 'criminal-investigations';
      scopeHint.textContent = criminal ? 'Leave blank if the report does not document this. Describe the tracing or analysis commissioned, the initial funds or transfers, and the period covered. Keep addresses and other identifying evidence out of this public summary.' : 'Leave blank if the report does not document this. Describe the asset, ownership, transaction, or dispute analysis commissioned and the period covered. This may concern assets in a divorce, an acquisition, or another dispute; no theft is implied.';
      figuresTitle.textContent = criminal ? 'Reported funds · optional' : 'Assets in scope · optional';
      lossField.hidden = !criminal;
      assetsField.hidden = criminal;
    };
    updateCaseContext();
  } else {
    form.append(h('p', { class: 'record-use-hint' }, recordWebsiteUse(editing)));
    const basics = [];
    if (!editing.file) basics.push(field('slug', 'Record ID', { full: true, hint: 'Choose a unique ID using lowercase words separated by hyphens. It becomes the record’s filename.' }));
    if ('title' in data) basics.push(field('title', 'Title', { full: true }));
    if ('name' in data) basics.push(field('name', 'Name', { full: true }));
    if ('headline' in data) basics.push(field('headline', 'Professional headline', { full: true }));
    if ('organization' in data || editing.collection === 'activities') basics.push(field('organization', editing.collection === 'activities' ? 'Organization (optional)' : 'Organization', { optional: editing.collection === 'activities' }));
    if ('role' in data || editing.collection === 'activities') basics.push(field('role', editing.collection === 'activities' ? 'Role (optional)' : 'Role', { optional: editing.collection === 'activities' }));
    if ('issuer' in data) basics.push(field('issuer', 'Credential issuer'));
    if ('issued_year' in data || editing.collection === 'credentials') basics.push(field('issued_year', 'Issue year', { type: 'number', numeric: true, min: '1900', step: '1' }));
    if ('institution' in data) basics.push(field('institution', 'Institution'));
    if ('program' in data) basics.push(field('program', 'Program'));
    if ('start' in data || editing.collection === 'education') basics.push(field('start', 'Start month', { type: 'month' }));
    if ('end' in data || editing.collection === 'education') basics.push(field('end', 'End month', { type: 'month', nullable: true, hint: 'Leave blank if the end month is unknown. Only recorded dates are displayed.' }));
    if (['profile', 'experience'].includes(editing.collection)) {
      basics.push(field('location', 'Location (optional)', { optional: true, full: true, placeholder: 'City, region or country', hint: 'Use only the level of detail you are comfortable publishing.' }));
      basics.push(field('show_location', 'Show location on website', { checkbox: true, full: true, hint: 'Hidden by default, even when a location is saved. Enable this only if you want visitors to see it.' }));
    } else if ('location' in data) basics.push(field('location', 'Location', { optional: true, full: true }));
    if (editing.collection === 'education') {
      basics.push(field('credential_type', 'Type of study', { choices: [['degree', 'Degree program'], ['attendance', 'Attendance / non-degree studies']] }));
      controlled.add('completion_status');
    }
    if (editing.collection === 'credentials') controlled.add('credential_type');
    if (['skills', 'interests', 'activities'].includes(editing.collection)) basics.push(contentIconField(editing, field, controls));
    if (editing.collection === 'activities') {
      basics.push(field('kind', 'Activity type', { choices: [['volunteering', 'Volunteer work'], ['memberships', 'Membership'], ['daos', 'DAO participation']], hint: 'Controls which activity list offers this record in Pages. Existing page selections are kept; review them if you change the type.' }),
        field('participation', 'Participation details (optional)', { full: true, optional: true, placeholder: 'How you participated in this organization or community' }));
    }
    if (['projects', 'repositories'].includes(editing.collection)) basics.push(field('contribution', 'Your contribution', { full: true }));
    if (editing.collection === 'profile') savedSourceFields.push(field('description_short', 'Saved profile summary', { textarea: true, full: true, optional: true, hint: 'Retained for your reference. The website uses your professional headline and biography instead.' }));
    else basics.push(field('description_short', editing.collection === 'pages' ? 'Search and sharing description' : 'Short description', { textarea: true, full: true, ...(editing.collection === 'pages' ? { hint: 'Public metadata used by search engines, shared links, and the browser. It may not appear in the page itself.' } : {}) }));
    if (editing.collection === 'contacts') basics.push(field('services_heading', 'Organization cards heading', { full: true, placeholder: 'Investigation services' }));
    if (editing.collection === 'pages') {
      const profiles = state.workspace.records.filter(record => record.collection === 'profile');
      const choices = profiles.map(record => [record.id, record.title || record.id]);
      if (data.profile && !profiles.some(record => record.id === data.profile)) choices.push([data.profile, `${data.profile} (missing profile)`]);
      if (!choices.length) choices.push(['', 'No profile available']);
      const profileField = field('profile', 'Shared profile', { choices, full: true, hint: 'Supplies your name, headline, and footer. Portraits, biography, and section text are edited on this page.' });
      const editProfile = recordEditButton(editing, () => profiles.find(record => record.id === controls.get('profile').input.value));
      controls.get('profile').input.addEventListener('change', editProfile.update);
      profileField.append(h('div', { class: 'page-row-actions' }, editProfile.node));
      basics.push(profileField);
    }
    form.append(section('Content basics', basics));
    if (editing.collection === 'skills') form.append(section('Skill assessment', [
      skillRatingField(field, controls),
      field('assessed_on', 'Assessment date (optional)', { type: 'date', nullable: true, full: true }),
    ]));
    if (editing.collection === 'activities') {
      const periods = recordRowsFields(editing, 'periods', { title: 'Participation dates', item: 'Participation period',
        fields: [{ key: 'start', label: 'Start month', type: 'month' }, { key: 'end', label: 'End month', type: 'month', nullable: true, hint: 'Leave blank for an ongoing period.' }],
        hint: 'Add documented periods of participation. Leave the list empty when dates are not recorded.' });
      controlled.add('periods'); structuredForms.set('periods', periods); form.append(periods.node);
    }
    if (editing.collection === 'pages') {
      pagePortraitForm = photoFields(editing, [], { portrait: true }); controlled.add(pagePortraitForm.key); form.append(pagePortraitForm.node);
      pageCompositionForm = pageCompositionFields(editing, field, controlled); editing.pageComposition = pageCompositionForm;
      form.append(pageCompositionForm.node);
    }
    if (editing.collection === 'pages' && data.slug !== 'home' && editing.file !== 'content/pages/home.md') {
      controlled.add('compact_sections'); controlled.add('contact_cta');
      pagePresentationForm = pagePresentationFields(editing, [
        field('blocks.contact_heading', 'Enquiry heading (optional)', { full: true, optional: true, hint: 'Heading for this page’s closing invitation.' }),
        field('blocks.contact_description', 'Enquiry description (optional)', { full: true, textarea: true, optional: true, hint: 'Text beneath the heading. Leave blank to use the service’s description.' }),
        field('blocks.contact_button_label', 'Enquiry button label (optional)', { full: true, optional: true, hint: 'Leave blank to use the default label for the selected service. The destination comes from the source service.' }),
      ]);
      form.append(pagePresentationForm.node);
      const contacts = state.workspace.records.filter(record => record.collection === 'contacts');
      const choices = [['', 'No contact cards'], ...contacts.map(record => [record.id, record.title || record.id])];
      if (data.contact && !contacts.some(record => record.id === data.contact)) choices.push([data.contact, `${data.contact} (missing record)`]);
      const sourceField = field('contact', 'Contact cards source', { choices, optional: true, full: true, hint: 'This shared contact record supplies the organization cards, personal contact card, and page introduction.' });
      const editCards = recordEditButton(editing, () => contacts.find(record => record.id === controls.get('contact').input.value));
      controls.get('contact').input.addEventListener('change', editCards.update);
      form.append(section('Contact cards', [sourceField, h('div', { class: 'field field-full' }, editCards.node)], 'Choose a contact record, then edit its organization cards and enquiries. Unsaved page changes are saved as a working draft before opening the record.'));
    }
    if (editing.collection === 'contacts') {
      controlled.add('services'); contactServiceForm = contactServicesFields(data); form.append(contactServiceForm.node);
    }
    if (editing.collection === 'pages' && data.slug !== 'home') {
      controlled.add('issuer_logos'); issuerLogoForm = issuerLogoFields(editing); form.append(issuerLogoForm.node);
    }
    if (['pages', 'credentials', 'experience', 'education'].includes(editing.collection)) {
      const photoTextFields = editing.collection === 'pages' ? [
        field('blocks.personal_photos_heading', 'Photo section heading', { full: true, optional: true, placeholder: 'Photos', hint: 'Only changes this page’s photo heading. Leave blank to use Photos.' }),
        field('blocks.personal_photos_intro', 'Photo section subtitle (optional)', { full: true, textarea: true, optional: true, hint: 'Text below this page’s photo heading. Leave blank for no subtitle.' }),
      ] : [];
      photoForm = photoFields(editing, photoTextFields); controlled.add(photoForm.key); form.append(photoForm.node);
    }
    if (editing.collection === 'credentials') form.append(section('Public credential details', [
      field('expires_on', 'Expiry date (optional)', { type: 'date', optional: true, hint: 'Enter the documented expiry date. Leave blank when none is recorded.' }),
      field('course_url', 'Training program URL (optional)', { type: 'url', optional: true, full: true, hint: 'A public link to the course or training program.' }),
      field('verification_url', 'Credential verification URL (optional)', { type: 'url', optional: true, full: true, hint: 'A public verification page. Check the destination for details you do not want to publish.' }),
    ]));
    if (editing.collection === 'experience') {
      controlled.add('periods'); controlled.add('active_position'); employmentDatesForm = employmentDatesFields(data); form.append(employmentDatesForm.node);
    }
    const visibleBlocks = publicBlockKeys(editing);
    const photoBlocks = editing.collection === 'pages' ? ['personal_photos_heading', 'personal_photos_intro'] : [];
    const managedBlocks = [...photoBlocks, ...(pageCompositionForm?.blockKeys || []), ...(pagePresentationForm ? ['contact_heading', 'contact_description', 'contact_button_label'] : [])];
    const otherBlocks = visibleBlocks.filter(key => !managedBlocks.includes(key));
    const blockLabel = (key) => ({ initials: 'Site initials', footer_tagline: 'Footer tagline', portrait_caption: 'Portrait caption', organization_short: 'Short organization name', timeline_summary: 'Career timeline summary', litigation_relevance: 'Litigation relevance', takeaway: 'Article takeaway' })[key] || key.replaceAll('_', ' ').replace(/^./, ch => ch.toUpperCase());
    if (otherBlocks.length) form.append(section('Website headings and short passages', otherBlocks.map(key => field(`blocks.${key}`, blockLabel(key), { full: true, textarea: true, optional: true })), editing.collection === 'pages' ? 'These headings are used by the sections selected for this page. Empty fields use the website defaults where available.' : 'Optional text used by this record’s website layout.'));
    for (const key of Object.keys(data.blocks || {}).filter(key => !visibleBlocks.includes(key) && !managedBlocks.includes(key) && !(editing.collection === 'profile' && key === 'portrait_caption'))) savedSourceFields.push(field(`blocks.${key}`, blockLabel(key), { full: true, textarea: true, optional: true, hint: editing.collection === 'pages' ? 'Not displayed by the sections currently selected for this page. Kept so it is available if you change those sections.' : 'Saved in the content source; the current website layout does not display this field.' }));
    if (editing.collection === 'contacts') {
      form.append(section('Personal contact card', [field('social.enabled', 'Show personal contact card', { checkbox: true, value: data.social?.enabled ?? Boolean(data.social), full: true }), field('social.title', 'Personal card heading', { full: true, optional: true, placeholder: 'Connect with me' }), field('social.name', 'Display name override (optional)', { optional: true, placeholder: 'Use the profile name' }), field('social.email', 'Public email', { type: 'email', optional: true }), field('social.description', 'Contact introduction', { full: true, textarea: true, optional: true })]));
    }
  }
  if (!isSettings) {
    const body = h('textarea', { id: 'field-body', class: 'narrative', value: editing.body, rows: 12, placeholder: isCase ? 'Describe the question, evidence, approach, findings, and limitations. Include only information suitable for the public website.' : 'Write the page or record content. Markdown headings, lists, and links are supported.' }); body.addEventListener('input', setDirty); controls.set('$body', { input: body });
    let bodyHint = 'Plain text and Markdown. Save and review your changes before applying them.';
    if (editing.collection === 'profile') { bodyHint = 'Retained as source text. Edit the public biography in Pages → About.'; body.readOnly = true; }
    if (editing.collection === 'pages' && data.contact && data.slug !== 'home' && editing.file !== 'content/pages/home.md') bodyHint = 'The selected contact record supplies this page’s introduction when it is visible. This text is the fallback when no visible contact record is available.';
    if (editing.collection === 'pages' && !data.contact) bodyHint = 'This text appears as the page introduction. Plain text and Markdown are supported.';
    if (editing.collection === 'pages' && (data.slug === 'home' || editing.file === 'content/pages/home.md')) bodyHint = 'This text appears in the homepage introduction beneath the hero statement. Plain text and Markdown are supported.';
    if (isChart) bodyHint = 'Saved in the group’s content file. The current website displays its title and short description, not this body text.';
    if (editing.collection === 'contacts') bodyHint = 'Supplies the page introduction on pages selecting this contact record. The contact-card introduction is a separate field.';
    if (isCase) bodyHint = 'Appears as the full narrative in this case’s public details and is included in case search.';
    if (!['profile', 'pages', 'contacts', 'charts', 'cases'].includes(editing.collection)) bodyHint = 'Appears in this record’s details on pages that include it, usually under Read more or Details. Expertise and project bodies are expanded.';
    body.setAttribute('aria-describedby', 'field-body-effect');
    const sourceOnly = isChart || editing.collection === 'profile';
    const bodyField = h('div', { class: 'field field-full' }, h('label', { htmlFor: 'field-body' }, isCase ? 'Evidence, findings & limitations' : editing.collection === 'profile' ? 'Saved biography source' : editing.collection === 'pages' ? 'Page introduction' : 'Record details'), body, h('p', { class: `field-effect${sourceOnly ? ' field-effect-private' : ''}`, id: 'field-body-effect' }, h('strong', {}, sourceOnly ? 'Not displayed: ' : 'On the website: '), bodyHint));
    if (editing.collection === 'profile') savedSourceFields.push(bodyField);
    else form.append(section(isCase ? 'Case narrative' : editing.collection === 'pages' ? 'Page introduction' : 'Main content', bodyField));
    if (!['profile', 'pages', 'contacts', 'charts'].includes(editing.collection)) {
      const links = recordRowsFields(editing, 'links', { title: 'Reference links', item: 'Reference link', reorder: true,
        fields: [{ key: 'label', label: 'Link label' }, { key: 'url', label: 'Website URL', type: 'url' }],
        hint: 'Public links shown with this record. Add a descriptive label and the full website address.' });
      controlled.add('links'); structuredForms.set('links', links); form.append(links.node);
    }
    if (!isCase && !isChart) {
      if (savedSourceFields.length) form.append(h('details', { class: 'advanced saved-source-fields' }, h('summary', {}, 'Saved source text (not displayed)'), h('p', { class: 'field-hint' }, 'These fields are retained in your content files, but the current website layout does not display them.'), h('div', { class: 'field-grid' }, savedSourceFields)));
      form.append(section('Editor note', field('editorial_note', 'Private working note (optional)', { full: true, textarea: true, optional: true, hint: 'Excluded from the generated website. This note stays in the content files and is included when you export the content pack.' })));
    }
    const extra = Object.fromEntries(Object.entries(data).filter(([key]) => !controlled.has(key) && key !== 'publication_status' && (!isCase || !['slug', 'case_status'].includes(key))));
    const advanced = h('textarea', { id: 'field-advanced', value: JSON.stringify(extra, null, 2), spellcheck: false, rows: 10 }); advanced.addEventListener('input', setDirty); controls.set('$advanced', { input: advanced });
    let guide = advancedFieldGuide(editing, extra);
    advanced.addEventListener('input', () => {
      try {
        const value = JSON.parse(advanced.value);
        if (!value || Array.isArray(value) || typeof value !== 'object') return;
        const updated = advancedFieldGuide({ ...editing, data: { ...data, ...value } }, value); updated.open = guide.open;
        guide.replaceWith(updated); guide = updated;
        pageCompositionForm?.syncFromAdvanced(value);
        pagePortraitForm?.syncFromAdvanced(value);
        photoForm?.syncFromAdvanced(value);
        pagePresentationForm?.syncFromAdvanced(value);
      } catch { /* Keep the last readable guide while JSON is incomplete. */ }
    });
    form.append(h('details', { class: 'advanced' }, h('summary', {}, editing.collection === 'pages' ? 'Additional page settings · JSON' : 'Additional fields · JSON'), h('div', { class: 'field' }, h('label', { htmlFor: 'field-advanced' }, editing.collection === 'pages' ? 'Other page settings' : 'Other existing fields'), guide, advanced, h('p', { class: 'field-hint' }, editing.collection === 'pages' ? 'Optional navigation, timeline, and grouping settings. Record selections, section order, and page text are managed by the form above.' : isCase ? 'Links and other structured case details. Fields edited above are managed by the form. Unchanged values are preserved.' : 'Links and other structured record details. Choose where this record appears in Pages. Fields edited above are managed by the form. Unchanged values are preserved.'))));
  }
  if (editing.collection === 'pages') form.insertBefore(sharedPageValues(editing, controls), form.querySelector('.form-section'));
  if (editing.issues?.length) form.append(issueList(editing.issues));
  const saveButton = h('button', { type: 'submit', class: 'button button-primary' }, icon('check'), 'Save working draft');
  form.append(h('div', { class: 'editor-actions' }, h('span', { id: 'save-state', class: 'save-state' }, editing.hadDraft ? 'Working draft saved · website content unchanged' : 'Website content unchanged'), h('div', { class: 'editor-action-group' }, editing.hadDraft && button('Review changes', () => navigateToReview(editing.file), 'subtle'), saveButton)));
  controls.get('slug')?.input.addEventListener('input', () => { controls.get('slug').input.dataset.manual = 'true'; });
  if (isCase && !editing.file) controls.get('case_number')?.input.addEventListener('input', () => {
    const filename = controls.get('$filename').input;
    if (filename.dataset.manual) return;
    const value = slugFrom(controls.get('case_number').input.value);
    filename.value = value ? `${value}.md` : '';
  });
  async function saveForm() {
    if (state.saving) return false;
    if (!form.reportValidity()) return false;
    let nextData;
    if (isSettings) {
      nextData = clone(data);
      for (const [key, {input}] of controls) {
        let value = input.value.trim();
        if (key === 'appearance.particles') value = value === 'true';
        const [top, sub] = key.split('.');
        if (sub) { nextData[top] ||= {}; nextData[top][sub] = value; } else nextData[top] = value;
      }
    } else {
      const extra = JSON.parse(controls.get('$advanced').input.value || '{}');
      if (!extra || Array.isArray(extra) || typeof extra !== 'object') throw new Error('Additional fields must be a JSON object.');
      nextData = { ...extra, publication_status: data.publication_status || 'draft' };
      // Merge the fields exposed by this form. Nested metric fields retain unedited values.
      for (const [key, options] of controls) {
        if (key.startsWith('$')) continue;
        let value = options.input.value;
        if (options.checkbox) value = options.input.checked;
        else if (options.list) value = value.split(options.path ? /\s*\/\s*/ : ',').map((item) => item.trim()).filter(Boolean);
        else if (options.numeric) value = value === '' ? null : Number(value);
        else if (options.nullable) value = value || null;
        else value = value.trim();
        const [top, sub] = key.split('.');
        if (sub) {
          const omitted = options.optional && (value === '' || value === null);
          if (!omitted || nextData[top] !== undefined || data[top] !== undefined) {
            nextData[top] ||= clone(data[top] || {});
            if (omitted) delete nextData[top][sub]; else nextData[top][sub] = value;
          }
        }
        else if (options.optional && (value === '' || value === null)) delete nextData[top];
        else nextData[top] = value;
      }
      if (isChart) nextData.categories = categoryForm.values();
      if (editing.collection === 'education' && Object.hasOwn(data, 'completion_status')) nextData.completion_status = data.completion_status;
      if (editing.collection === 'credentials' && Object.hasOwn(data, 'credential_type')) nextData.credential_type = data.credential_type;
      if (contactServiceForm) nextData.services = contactServiceForm.value();
      for (const [key, model] of structuredForms) {
        const value = model.value();
        if (value === undefined) delete nextData[key]; else nextData[key] = value;
      }
      if (pageCompositionForm) {
        for (const [key, value] of Object.entries(pageCompositionForm.values())) {
          if (value === undefined) delete nextData[key]; else nextData[key] = value;
        }
      }
      if (pagePresentationForm) {
        const compact = pagePresentationForm.compactValue();
        if (compact === undefined) delete nextData.compact_sections; else nextData.compact_sections = compact;
        const contact = pagePresentationForm.contactValue();
        if (contact === undefined) delete nextData.contact_cta; else nextData.contact_cta = contact;
      }
      if (issuerLogoForm) {
        const value = issuerLogoForm.value();
        if (value === undefined) delete nextData.issuer_logos; else nextData.issuer_logos = value;
      }
      for (const imageForm of [pagePortraitForm, photoForm].filter(Boolean)) {
        const value = imageForm.value();
        if (value === undefined) delete nextData[imageForm.key]; else nextData[imageForm.key] = value;
      }
      if (employmentDatesForm) {
        const employmentDates = employmentDatesForm.values(); nextData.periods = employmentDates.periods;
        if (Object.hasOwn(employmentDates, 'active_position')) nextData.active_position = employmentDates.active_position;
        else delete nextData.active_position;
      }
      if (isCase) {
        nextData.slug = editing.file ? data.slug : controls.get('$filename').input.value.trim().replace(/\.md$/i, '');
        nextData.jurisdictions = [...jurisdictionInputs].filter(([, input]) => input.checked).map(([value]) => value);
        nextData.off_chain_leads = [...offChainLeadInputs].filter(([, input]) => input.checked).map(([id]) => id);
        delete nextData.case_status;
        if (nextData.metrics) {
          delete nextData.metrics.wallets_reviewed;
          delete nextData.metrics.transactions_reviewed;
          delete nextData.metrics.valuation_date;
        }
      }
      if (editing.collection === 'contacts' && nextData.social) {
        if (nextData.social.title || nextData.social.email || nextData.social.name || nextData.social.description || nextData.social.phone || nextData.social.links?.length) {
          nextData.social.title ||= 'Connect with me'; nextData.social.description ||= 'Professional enquiries'; nextData.social.enabled ??= true; nextData.social.links ||= [];
        } else delete nextData.social;
      }
    }
    if (!nextData || Array.isArray(nextData) || typeof nextData !== 'object') throw new Error('The record must be a JSON object.');
    const slug = nextData.slug;
    if (!editing.file && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug || '')) throw new Error(isCase ? 'Enter a case filename using lowercase letters, numbers and hyphens, with an optional .md extension.' : 'Add a record ID using lowercase words separated by hyphens.');
    const file = editing.file || `content/${editing.collection}/${slug}.md`;
    const body = isSettings ? '' : controls.get('$body').input.value;
    const removeFields = removedFields(data, nextData);
    const workspaceId = state.workspaceId;
    const disabledControls = [...form.elements].map(input => [input, input.disabled]);
    state.saving = true; saveButton.disabled = true;
    for (const [input] of disabledControls) input.disabled = true;
    try {
      await api.save({ file, data: nextData, ...(isSettings || body === editing.body.replace(/\r\n/g, '\n') ? {} : { body }), sourceHash: editing.sourceHash, expectedDraftHash: editing.draftHash ?? null, removeFields });
      if (state.editing !== editing || state.workspaceId !== workspaceId) return false;
      await refreshState();
      if (state.editing !== editing || state.workspaceId !== workspaceId) return false;
      state.dirty = false;
      if (!await selectRecord(file)) return false;
      notify('Working draft saved. Review it before applying changes to website content.');
      return true;
    } finally {
      state.saving = false;
      for (const [input, disabled] of disabledControls) if (input.isConnected) input.disabled = disabled;
    }
  }
  editing.saveDraft = saveForm;
}

async function navigateToReview(file) { if (!mayLeave()) return; disposeCaseCharts(); state.dirty = false; state.view = 'review'; state.editing = null; state.reviewFile = file; updateHeader(); await renderReview(file); }
async function renderReview(file = state.reviewFile) {
  const drafts = draftRecords();
  if (!file || !drafts.some((entry) => entry.file === file)) file = drafts[0]?.file;
  const selection = ++selectionRequest;
  const review = file ? await api.review(file) : null;
  if (selection !== selectionRequest) return;
  state.reviewFile = file || null; state.review = review; renderReviewShell();
}
function renderReviewShell() {
  disposeCaseCharts();
  const drafts = draftRecords();
  main.replaceChildren(heading('Review changes', 'Compare your working drafts with website content. Applying a record updates local files; it does not deploy your website.'));
  if (!drafts.length) { main.append(h('section', { class: 'panel' }, empty('You’re up to date', 'No working drafts are waiting for review. Open a record to make another change.', button('Back to cases', () => navigate('cases'), 'subtle'), 'review'))); return; }
  const list = h('div', { class: 'record-list', 'aria-label': 'Working drafts' }, ...drafts.map((entry) => h('button', { type: 'button', class: `record-item${state.reviewFile === entry.file ? ' is-selected' : ''}`, onclick: () => perform(() => renderReview(entry.file)) }, h('span', { class: 'record-title' }, recordTitle(entry)), h('span', { class: 'record-subtitle' }, friendlyCollection(entry.collection)), h('span', { class: 'record-meta' }, badge('Working draft', 'gold'), entry.issues?.length > 0 && badge('Needs attention', 'red')))));
  const detail = h('div', { class: 'review-details' }); main.append(h('section', { class: 'panel review-layout' }, list, detail));
  const review = state.review;
  if (!review) { detail.append(empty('Select a working draft', 'Review its changes before applying it to website content.', null, 'review')); return; }
  const draft = review.draft || {}; const file = state.reviewFile; const record = drafts.find((entry) => entry.file === file); const isSettings = file === 'site.json';
  detail.append(h('div', { class: 'review-summary' }, h('h2', {}, recordTitle(record || draft)), h('div', { class: 'editor-path' }, file)), h('p', { class: 'review-note' }, 'A working draft is separate from your website files. Choose how to apply it above. A release must still be built and uploaded to change the live site.'));
  if (review.issues?.length) {
    detail.append(issueList(review.issues));
  } else detail.append(h('div', { class: 'validation-success' }, icon('check'), 'No validation issues found'));
  const changes = review.changes || []; const fields = changes.filter((change) => change.field !== 'body'); const body = changes.find((change) => change.field === 'body');
  if (fields.length) {
    const rows = fields.map((change) => h('tr', {}, h('td', {}, change.field), h('td', {}, valueText(change.before)), h('td', {}, valueText(change.after))));
    detail.append(h('table', { class: 'diff-table' }, h('caption', { class: 'sr-only' }, 'Changed record fields'), h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Field'), h('th', { scope: 'col' }, 'Current'), h('th', { scope: 'col' }, 'Working draft'))), h('tbody', {}, rows)));
  }
  if (body) detail.append(h('section', { class: 'form-section' }, h('h3', { class: 'section-title' }, 'Narrative changes'), h('div', { class: 'body-diff' }, h('div', {}, h('h4', {}, 'Current content'), h('pre', {}, body.before || 'No content yet.')), h('div', { class: 'after' }, h('h4', {}, 'Working draft'), h('pre', {}, body.after || 'No content.')))));
  if (!changes.length) detail.append(h('p', { class: 'muted' }, 'There are no content differences in this draft.'));
  const applyDraft = button(isSettings ? 'Apply settings' : 'Apply as draft', () => applyReview('draft'), 'primary', 'check'); applyDraft.disabled = review.canApply === false;
  const applyPublished = button('Apply as published', () => applyReview('published'), 'subtle');
  const isCase = record?.collection === 'cases' || file?.startsWith('content/cases/');
  applyPublished.disabled = review.canApply === false;
  detail.prepend(h('div', { class: 'review-actions', role: 'group', 'aria-label': 'Review actions' }, applyDraft, !isSettings && applyPublished, button('Edit draft', async () => { state.view = isCase ? 'cases' : record?.collection === 'charts' || file?.startsWith('content/charts/') ? 'categories' : 'content'; state.editing = null; render(); await selectRecord(file); }), button('Discard draft', async () => { if (!window.confirm('Discard this working draft? Your existing website content will be kept.')) return; await api.discard(file, review.draftHash); await refreshState(); await renderReview(); notify('Working draft discarded. Existing website content was kept.'); }, 'danger')));
  async function applyReview(publication) {
    await api.apply(file, publication, review.draftHash); await refreshState(); await renderReview();
    notify(isSettings ? 'Website settings applied locally. Rebuild to include them in a release.' : `Changes applied as ${publication === 'published' ? 'published content' : 'a website draft'}. Your live site has not changed.`);
  }
}

function renderRelease() {
  const preview = button('Start local preview', () => startJob('preview'), 'primary', 'preview');
  const check = button('Check content', () => startJob('check'), 'subtle', 'check');
  const destination = h('input', { type: 'text', id: 'release-destination', value: state.releaseDestination, placeholder: '/path/to/new-release-folder', spellcheck: false, autocomplete: 'off', oninput: (event) => { state.releaseDestination = event.target.value; } });
  main.replaceChildren(heading('Preview & release', 'Review your site locally, then prepare published content for hosting. The website builder never deploys automatically.'),
    h('div', { class: 'release-grid' }, h('section', { class: 'panel release-card' }, h('div', { class: 'release-icon' }, icon('preview')), h('h2', {}, 'Preview your website'), h('p', {}, 'Open the local website with drafts included. Working drafts must first be applied as website drafts to appear in the preview.'), h('div', { class: 'editor-action-group' }, preview, check)),
      h('section', { class: 'panel release-card' }, h('div', { class: 'release-icon' }, icon('folder')), h('h2', {}, 'Prepare a release'), h('p', {}, 'Build a fresh static website using published content only. The result is a new folder you can review and upload separately.'), h('div', { class: 'field' }, h('label', { htmlFor: 'release-destination' }, 'New release folder'), destination, h('p', { class: 'field-hint' }, 'Choose a new folder outside your content and builder folders. Existing folders are never overwritten.')), button('Build published release', () => { if (!state.releaseDestination.trim()) throw new Error('Choose a new release folder first.'); return startJob('package', state.releaseDestination.trim()); }, 'primary', 'arrow'))), h('div', { id: 'jobs-area' }));
  renderJobs();
}
async function startJob(kind, destination) { state.pollingFailed = false; await api.job(kind, destination); state.jobs = await api.jobs(); renderJobs(); notify(kind === 'preview' ? 'Starting the local preview. Its link will appear below when ready.' : kind === 'check' ? 'Checking website content.' : 'Building a published release. Nothing will be uploaded.'); }
function safeLink(url, label) { try { const parsed = new URL(url); if (!['http:', 'https:'].includes(parsed.protocol)) return null; return h('a', { class: 'button button-subtle', href: parsed.href, target: '_blank', rel: 'noopener noreferrer' }, label, icon('external')); } catch { return null; } }
function renderJobs() {
  const host = $('#jobs-area'); if (!host) return;
  const jobs = state.jobs || {}; const active = jobs.active; const recent = Array.isArray(jobs.recent) ? jobs.recent : []; const job = active || recent[0]; const preview = jobs.preview;
  if (!job && !preview) { host.replaceChildren(h('section', { class: 'panel job-panel' }, h('p', { class: 'muted' }, 'Preview and build progress will appear here.'))); return; }
  const log = job?.log ?? job?.logs ?? job?.output ?? '';
  const logText = Array.isArray(log) ? log.map((line) => typeof line === 'string' ? line : JSON.stringify(line)).join('\n') : String(log || 'Waiting for output…');
  const panel = h('section', { class: 'panel job-panel' }, h('div', { class: 'job-title' }, h('h2', {}, job ? `${{ preview: 'Local preview', check: 'Content check', package: 'Published release' }[job.kind] || 'Website builder task'}` : 'Local preview'), badge(job?.status || (preview ? 'Preview available' : 'Ready'), active ? 'gold' : job?.status === 'failed' ? 'red' : 'teal')));
  if (job) panel.append(h('pre', { 'aria-label': 'Task output' }, logText));
  const actions = h('div', { class: 'job-meta' });
  if (preview?.url) actions.append(safeLink(preview.url, 'Open preview'));
  if (preview || active?.kind === 'preview') actions.append(button('Stop preview', async () => { await api.stop(); state.jobs = await api.jobs(); renderJobs(); notify('The local preview has been stopped.'); }));
  if (job?.destination || job?.directory) actions.append(h('span', {}, `Output: ${job.destination || job.directory}`));
  panel.append(actions); host.replaceChildren(panel);
}

async function openFolderDialog(action = 'open') {
  if (!mayLeave()) return;
  state.folderAction = action;
  const dialog = $('#folder-dialog'); $('#folder-dialog-title').textContent = action === 'new' ? 'Create a blank content pack' : 'Select your content folder';
  $('#folder-input').value = action === 'new' ? '' : state.workspace?.dataDir || '';
  $('#folder-input').placeholder = action === 'new' ? '/path/to/new-investigator-folder' : '/path/to/investigator-site';
  $('#folder-form button[type=submit]').replaceChildren(action === 'new' ? 'Create content pack' : 'Open content folder', icon('arrow'));
  $('#folder-error').hidden = true;
  dialog.showModal();
  const browser = $('#recent-folders'); browser.replaceChildren(button('Browse folders', () => browseFolders($('#folder-input').value || state.browseRoot), 'quiet', 'folder'));
  $('#folder-input').focus();
}
async function browseFolders(path = '') {
  const result = await api.folders(path);
  const host = $('#recent-folders'); const list = h('div', { class: 'folder-browser', 'aria-label': 'Folders' });
  host.replaceChildren(h('div', { class: 'recent-folders' }, h('h3', {}, result.path || 'Folders'), list));
  if (result.parent && result.parent !== result.path) list.append(h('button', { type: 'button', class: 'recent-folder', onclick: () => perform(() => browseFolders(result.parent)) }, '↑ Parent folder'));
  for (const directory of result.directories || []) list.append(h('button', { type: 'button', class: 'recent-folder', onclick: () => perform(async () => { $('#folder-input').value = directory.path; await browseFolders(directory.path); }) }, icon('folder'), ` ${directory.name}`, directory.isWorkspace ? ' · investigator content pack' : ''));
  if (!result.directories?.length) list.append(h('p', { class: 'field-hint' }, 'No subfolders. Use the path field to select this folder or name a new one.'));
}
async function submitFolder(event) {
  event.preventDefault(); const error = $('#folder-error'); error.hidden = true;
  const submit = $('#folder-form button[type=submit]'); submit.disabled = true;
  try {
    const path = $('#folder-input').value.trim(); if (!path) throw new Error('Enter a content folder path.');
    if (state.folderAction === 'new') await api.create(path); else await api.open(path);
    state.dirty = false; state.editing = null; state.selectedFile = null; state.review = null; state.query = ''; await refreshState(); $('#folder-dialog').close(); render(); notify(`Opened ${state.workspace?.dataDir || 'your content folder'}.`);
  } catch (cause) { error.textContent = cause.message || String(cause); error.hidden = false; }
  finally { submit.disabled = false; }
}

async function renderAssetDialog(options = {}) {
  const workspaceId = state.workspaceId;
  const dataDir = state.workspace.dataDir;
  const dialog = h('dialog', { class: 'folder-dialog', 'aria-labelledby': 'asset-title' });
  const input = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', id: 'asset-file' });
  const kind = h('select', { id: 'asset-kind' }, h('option', { value: 'portrait' }, 'Portrait'), h('option', { value: 'personal' }, 'Personal photo'), h('option', { value: 'credential' }, 'Credential badge'), h('option', { value: 'organization' }, 'Organization logo'));
  if (options.kind) kind.value = options.kind;
  const kindControl = options.kind
    ? h('input', { type: 'text', id: 'asset-kind', value: kind.selectedOptions[0].textContent, readOnly: true, 'aria-describedby': 'asset-kind-hint' })
    : kind;
  const name = h('input', { type: 'text', id: 'asset-name', placeholder: 'portrait-speaking.webp', autocomplete: 'off', spellcheck: false });
  input.addEventListener('change', () => { const file = input.files?.[0]; if (file) name.value = file.name.toLowerCase().replaceAll(' ', '-').replace(/[^a-z0-9.-]/g, '-'); });
  const message = h('p', { class: 'field-hint', role: 'status' });
  const error = h('p', { class: 'field-error', role: 'alert', hidden: true });
  let uploading = false;
  const upload = h('button', { type: 'submit', class: 'button button-primary' }, 'Save image');
  const folderHint = h('p', { class: 'field-hint photo-folder' });
  const updateFolder = () => { folderHint.textContent = `Saved in: ${dataDir}/${{ portrait: 'assets', personal: 'assets/images/personal', credential: 'assets/credentials', organization: 'assets/organizations' }[kind.value]}/`; };
  updateFolder(); kind.addEventListener('change', updateFolder);
  async function saveImage(event) {
    event.preventDefault();
    if (uploading) return;
    uploading = true; upload.disabled = true; upload.textContent = 'Saving image…';
    error.hidden = true; message.textContent = 'Reading and saving the image…';
    let saved;
    try {
      const file = input.files?.[0];
      if (!file) throw new Error('Choose a PNG, JPEG, or WebP image.');
      const uploadKind = kind.value; const uploadName = name.value.trim();
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1]);
        reader.onerror = () => reject(new Error('The image could not be read.'));
        reader.readAsDataURL(file);
      });
      if (!dialog.isConnected || !dialog.open) throw new Error('The upload was cancelled before the file was saved.');
      if (state.workspaceId !== workspaceId) throw new Error('The selected investigator changed. Reopen the image upload for the correct folder.');
      saved = await api.upload({ kind: uploadKind, name: uploadName, base64 });
      message.textContent = `Image saved: ${saved.file}.`;
      input.value = '';
      if (options.onSaved) {
        await options.onSaved(saved); dialog.close();
        notify(`Image assigned: ${saved.file}. Add its description, then save and review the record.`);
      } else {
        message.textContent += ' Choose it in the relevant record’s picture controls.';
      }
    } catch (cause) {
      message.textContent = '';
      const reason = kind.value === 'organization' && cause.message === 'Choose portrait, personal, or credential.'
        ? 'Organization logo is already selected correctly. The running builder has not loaded organization-logo support. Save any unsaved edits, stop and restart the builder, then refresh this tab and try again.'
        : cause.message || String(cause);
      error.textContent = `${saved ? `The file was saved as ${saved.file}, but its assignment could not be completed. ` : ''}${reason}`;
      error.hidden = false;
    } finally {
      uploading = false; upload.disabled = false; upload.textContent = 'Save image';
    }
  }
  const form = h('form', { onsubmit: saveImage }, h('div', { class: 'dialog-heading' }, h('div', {}, h('p', { class: 'eyebrow' }, 'WEBSITE IMAGES'), h('h2', { id: 'asset-title' }, 'Add an image')), button('Close', () => dialog.close(), 'quiet')), h('p', { class: 'muted' }, options.onSaved ? 'Upload a local image to use in this record. The file is saved immediately; the record assignment still needs to be saved and reviewed.' : 'Add a local image, then choose it in the picture controls of your profile, page, job, or credential record.'), h('div', { class: 'field-grid' }, h('div', { class: 'field field-full' }, h('label', { htmlFor: 'asset-file' }, 'Image file'), input), h('div', { class: 'field' }, h('label', { htmlFor: 'asset-kind' }, 'Image type'), kindControl, options.kind && h('p', { class: 'field-hint', id: 'asset-kind-hint' }, 'Set by the record you are editing.')), h('div', { class: 'field' }, h('label', { htmlFor: 'asset-name' }, 'New filename'), name)), folderHint, message, error);
  form.append(h('div', { class: 'dialog-actions' }, upload)); dialog.append(form); document.body.append(dialog); dialog.addEventListener('close', () => dialog.remove(), { once: true }); dialog.showModal();
}

for (const nav of document.querySelectorAll('[data-view]')) nav.addEventListener('click', () => perform(() => navigate(nav.dataset.view)));
$('.brand').addEventListener('click', (event) => { event.preventDefault(); perform(() => navigate('cases')); });
$('#change-folder').addEventListener('click', () => perform(() => openFolderDialog()));
$('#folder-form').addEventListener('submit', submitFolder);
$('#cancel-folder').addEventListener('click', () => $('#folder-dialog').close());
$('#close-folder-dialog').addEventListener('click', () => $('#folder-dialog').close());
window.addEventListener('beforeunload', (event) => { if (state.dirty) event.preventDefault(); });
await perform(async () => { await refreshState(); render(); });
setInterval(() => { if (!state.pollingFailed && state.workspace && (state.view === 'release' || state.jobs?.active || state.jobs?.preview)) api.jobs().then((jobs) => { state.jobs = jobs; renderJobs(); }).catch((error) => { state.pollingFailed = true; notify(`Task status could not be refreshed: ${error.message}`, true); }); }, 2500);
