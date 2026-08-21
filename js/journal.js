import { journalEntries } from '../data/journal.js';

const list = document.querySelector('[data-journal-list]');
const filters = document.querySelector('[data-journal-filters]');

function render(filter = 'All') {
  if (!list) return;
  const selected = filter === 'All' ? journalEntries : journalEntries.filter((entry) => entry.domain === filter || entry.region === filter);
  const limit = Number(list.dataset.limit || 0);
  const entries = limit > 0 ? selected.slice(0, limit) : selected;
  list.innerHTML = entries.map((entry) => `
    <article class="journal-row reveal is-visible">
      <div class="journal-domain">
        <span>${entry.year} · ${entry.region}</span>
        <strong>${entry.domain}</strong>
      </div>
      <p>${entry.summary}</p>
      <span class="status-pill">${entry.status}</span>
    </article>
  `).join('');
}

if (filters) {
  const values = ['All', ...new Set(journalEntries.map((entry) => entry.domain))];
  filters.innerHTML = values.map((value, index) => `<button class="filter-button${index === 0 ? ' is-active' : ''}" type="button" data-filter="${value}">${value}</button>`).join('');
  filters.addEventListener('click', (event) => {
    const button = event.target.closest('[data-filter]');
    if (!button) return;
    filters.querySelectorAll('[data-filter]').forEach((item) => item.classList.toggle('is-active', item === button));
    render(button.dataset.filter);
  });
}
render();
