const regions = {
  'new-york': { title: 'New York', note: 'Broad operational presence across significant private residential and project environments.' },
  florida: { title: 'Florida', note: 'Residential, travel and destination operations coordinated through one operating structure.' },
  hamptons: { title: 'The Hamptons', note: 'Seasonal estate operations and portfolio readiness across selected private environments.' },
  israel: { title: 'Israel', note: 'Connected operational oversight across approved private activities and destination requirements.' },
  europe: { title: 'Europe', note: 'Cross-market coordination supporting residences, projects, travel and private experiences.' },
  mediterranean: { title: 'Mediterranean', note: 'Marine operations, seasonal movements and destination readiness across broad approved regions.' },
  worldwide: { title: 'Worldwide', note: 'International operations connected through one operating picture—without publishing exact locations.' }
};

const map = document.querySelector('[data-world-map]');
const card = map?.querySelector('[data-map-card]');
if (map && card) {
  const markers = [...map.querySelectorAll('[data-region]')];
  const select = (id) => {
    const region = regions[id];
    if (!region) return;
    markers.forEach((marker) => marker.classList.toggle('is-active', marker.dataset.region === id));
    card.innerHTML = `<span class="small-caps">Broad region</span><h3>${region.title}</h3><p>${region.note}</p>`;
  };
  markers.forEach((marker) => {
    marker.addEventListener('click', () => select(marker.dataset.region));
    marker.addEventListener('mouseenter', () => select(marker.dataset.region));
    marker.addEventListener('focus', () => select(marker.dataset.region));
  });
  select('new-york');
}
