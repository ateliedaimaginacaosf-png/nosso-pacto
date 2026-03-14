import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

const PREVIEW_CACHE_RESET_FLAG = "lovable-preview-cache-reset";

const renderApp = () => {
  createRoot(document.getElementById("root")!).render(<App />);
};

const clearPreviewCache = async () => {
  const registrations = await navigator.serviceWorker.getRegistrations();
  const hadRegistrations = registrations.length > 0;

  await Promise.all(registrations.map((registration) => registration.unregister()));

  let hadCaches = false;
  if ("caches" in window) {
    const cacheKeys = await caches.keys();
    hadCaches = cacheKeys.length > 0;
    await Promise.all(cacheKeys.map((cacheKey) => caches.delete(cacheKey)));
  }

  return hadRegistrations || hadCaches;
};

const bootstrap = async () => {
  const isPreviewHost =
    window.location.hostname.includes("id-preview--") ||
    window.location.hostname.includes("lovable.dev");
  const isEmbeddedPreview = window.self !== window.top;
  const shouldResetCache = isPreviewHost || isEmbeddedPreview;

  if (shouldResetCache && "serviceWorker" in navigator) {
    try {
      const hadStaleRuntimeCache = await clearPreviewCache();
      const didAutoReload = sessionStorage.getItem(PREVIEW_CACHE_RESET_FLAG) === "1";

      if (hadStaleRuntimeCache && !didAutoReload) {
        sessionStorage.setItem(PREVIEW_CACHE_RESET_FLAG, "1");
        window.location.reload();
        return;
      }

      sessionStorage.removeItem(PREVIEW_CACHE_RESET_FLAG);
    } catch (error) {
      console.warn("Falha ao limpar cache do preview", error);
    }
  }

  renderApp();
};

void bootstrap();
