// Roda dentro do site do Gaveta e repassa para a extensão:
// - a confirmação de que os links foram gravados (para fechar as abas)
// - a lista de gavetas (para o seletor do popup)
window.addEventListener('message', (event) => {
  if (event.source !== window || event.origin !== window.location.origin) return;
  const data = event.data;
  if (data?.source !== 'gaveta-app') return;
  if (data.type === 'saved' && typeof data.rid === 'string') {
    chrome.runtime.sendMessage({ source: 'gaveta-app', type: 'saved', rid: data.rid }).catch(() => {});
  } else if (data.type === 'categories' && Array.isArray(data.items)) {
    chrome.runtime.sendMessage({ source: 'gaveta-app', type: 'categories', autoGroup: data.autoGroup === true, items: data.items }).catch(() => {});
  }
});
