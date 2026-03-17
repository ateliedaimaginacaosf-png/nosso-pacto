import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

const APP_CACHE_RESET_FLAG = "lovable-app-cache-reset";
const PUSH_SERVICE_WORKER_PATH = "/sw-push.js";

const renderApp = () => {
  createRoot(document.getElementById("root")!).render(<App />);
};

const getServiceWorkerScriptUrl = (registration: ServiceWorkerRegistration) =>
  registration.active?.scriptURL ??
  registration.waiting?.scriptURL ??
  registration.installing?.scriptURL ??
  "";

const isPushServiceWorker = (scriptUrl: string) => {
  if (!scriptUrl) return false;

  try {
    return new URL(scriptUrl, window.location.origin).pathname === PUSH_SERVICE_WORKER_PATH;
  } catch {
    return scriptUrl.endsWith(PUSH_SERVICE_WORKER_PATH);
  }
};

const clearBrowserAppCache = async () => {
  const registrations = await navigator.serviceWorker.getRegistrations();
  const appShellRegistrations = registrations.filter(
    (registration) => !isPushServiceWorker(getServiceWorkerScriptUrl(registration))
  );
  const hadAppShellRegistrations = appShellRegistrations.length > 0;

  await Promise.all(appShellRegistrations.map((registration) => registration.unregister()));

  let hadCaches = false;
  if ("caches" in window) {
    const cacheKeys = await caches.keys();
    hadCaches = cacheKeys.length > 0;
    await Promise.all(cacheKeys.map((cacheKey) => caches.delete(cacheKey)));
  }

  return hadAppShellRegistrations || hadCaches;
};

const isStandaloneApp = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

const bootstrap = async () => {
  const isPreviewHost =
    window.location.hostname.includes("id-preview--") ||
    window.location.hostname.includes("lovable.dev");
  const isEmbeddedPreview = window.self !== window.top;
  const shouldResetCache = isPreviewHost || isEmbeddedPreview || !isStandaloneApp();

  if (shouldResetCache && "serviceWorker" in navigator) {
    try {
      const hadStaleRuntimeCache = await clearBrowserAppCache();
      const didAutoReload = sessionStorage.getItem(APP_CACHE_RESET_FLAG) === "1";

      if (hadStaleRuntimeCache && !didAutoReload) {
        sessionStorage.setItem(APP_CACHE_RESET_FLAG, "1");
        window.location.reload();
        return;
      }

      sessionStorage.removeItem(APP_CACHE_RESET_FLAG);
    } catch (error) {
      console.warn("Falha ao limpar cache do app", error);
    }
  }

  renderApp();
};

void bootstrap();