import { operationPanels } from '../data/operations.js';

const command = document.querySelector('[data-operations-command]');
if (command) {
  const nav = command.querySelector('[data-operation-tabs]');
  const media = command.querySelector('[data-operation-media]');
  const copy = command.querySelector('[data-operation-copy]');
  let activeVideo = null;

  nav.innerHTML = operationPanels.map((panel, index) => `
    <button class="operation-tab${index === 0 ? ' is-active' : ''}" type="button" data-operation="${panel.id}">
      <span>${panel.number}</span>
      <strong>${panel.title}</strong>
      <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h11M11 6l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>
  `).join('');

  const activate = (id) => {
    const panel = operationPanels.find((item) => item.id === id) || operationPanels[0];
    nav.querySelectorAll('[data-operation]').forEach((button) => button.classList.toggle('is-active', button.dataset.operation === panel.id));
    activeVideo?.pause();
    if (panel.mediaType === 'video') {
      media.innerHTML = `<video muted loop playsinline preload="metadata" poster="${panel.poster}" aria-hidden="true"><source src="${panel.media}" type="video/mp4"></video>`;
      activeVideo = media.querySelector('video');
      activeVideo.play().catch(() => {});
    } else {
      media.innerHTML = `<img src="${panel.media}" alt="" aria-hidden="true">`;
      activeVideo = null;
    }
    copy.innerHTML = `
      <span class="operation-number">${panel.number} · OPERATING DIVISION</span>
      <h2>${panel.title}</h2>
      <p class="strap">${panel.strap}</p>
      <p>${panel.description}</p>
    `;
  };

  nav.addEventListener('click', (event) => {
    const button = event.target.closest('[data-operation]');
    if (button) activate(button.dataset.operation);
  });
  activate(operationPanels[0].id);
}
