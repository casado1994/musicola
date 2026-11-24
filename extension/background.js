// Musicola (extensión) - trabajo en segundo plano:
//  1. Al pulsar el icono, abre el reproductor (o lo trae al frente si ya está abierto).
//  2. Ajusta las cabeceras de nuestras peticiones a YouTube para que parezcan del cliente
//     correspondiente (User-Agent, Origin). Solo afecta a peticiones marcadas por la
//     extensión ("mc=..." en youtube.com) y a audio de clientes que tú no usas al navegar
//     (VISIONOS / ANDROID_VR), así que no toca tu YouTube normal.

const UA = {
  visionos: "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_7_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15",
  android_vr: "com.google.android.apps.youtube.vr.oculus/1.65.10 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip",
};
const TYPES = ["xmlhttprequest", "media", "other"];

const set = (header, value) => ({ header, operation: "set", value });
const rule = (id, priority, urlFilter, requestDomains, headers) => ({
  id, priority,
  action: { type: "modifyHeaders", requestHeaders: headers },
  condition: { urlFilter, requestDomains, resourceTypes: TYPES },
});

async function setupRules() {
  const www = [set("origin", "https://www.youtube.com"), set("referer", "https://www.youtube.com/")];
  const music = [set("origin", "https://music.youtube.com"), set("referer", "https://music.youtube.com/")];
  const rules = [
    rule(1, 1, "mc=web", ["www.youtube.com"], www),
    rule(2, 1, "mc=music", ["music.youtube.com"], music),
    rule(3, 2, "mc=visionos", ["www.youtube.com"], [...www, set("user-agent", UA.visionos)]),
    rule(4, 2, "mc=android_vr", ["www.youtube.com"], [...www, set("user-agent", UA.android_vr)]),
    // Audio: la URL de YouTube indica el cliente con c=...
    rule(5, 2, "c=VISIONOS", ["googlevideo.com"], [set("user-agent", UA.visionos)]),
    rule(6, 2, "c=ANDROID_VR", ["googlevideo.com"], [set("user-agent", UA.android_vr)]),
  ];
  const old = await chrome.declarativeNetRequest.getDynamicRules();
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: old.map((r) => r.id),
    addRules: rules,
  });
}

chrome.runtime.onInstalled.addListener(setupRules);
chrome.runtime.onStartup.addListener(setupRules);

chrome.action.onClicked.addListener(async () => {
  const url = chrome.runtime.getURL("player.html");
  const [tab] = await chrome.tabs.query({ url });
  if (tab) {
    await chrome.tabs.update(tab.id, { active: true });
    await chrome.windows.update(tab.windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url });
  }
});
