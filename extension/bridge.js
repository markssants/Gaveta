// Roda dentro do site do Gaveta. Repassa para a extensão a confirmação
// de que os links foram gravados, para ela poder fechar as abas.
window.addEventListener('message', (event) => {
  if (event.source !== window || event.origin !== window.location.origin) return;
  const data = event.data;
  if (data?.source !== 'gaveta-app' || data.type !== 'saved' || typeof data.rid !== 'string') return;
  chrome.runtime.sendMessage({ source: 'gaveta-app', type: 'saved', rid: data.rid }).catch(() => {});
});
