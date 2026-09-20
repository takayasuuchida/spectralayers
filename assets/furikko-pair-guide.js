// No data requests on the guide. Fragments stay in the browser, never in a query.
import { parseIdentity } from './furikko-pair-core.js?v=20260920';
function updateBack() {
  document.getElementById('back-to-board').href = `furikko-pair.html${parseIdentity(location.hash) ? location.hash : ''}`;
}
updateBack();
window.addEventListener('hashchange', updateBack);
