import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

const renderApp = () => {
  createRoot(document.getElementById("root")!).render(<App />);
};

const bootstrap = async () => {
  const isPreview = window.location.hostname.includes("id-preview--");

  if (isPreview && "serviceWorker" in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));

    if ("caches" in window) {
      const cacheKeys = await caches.keys();
      await Promise.all(cacheKeys.map((cacheKey) => caches.delete(cacheKey)));
    }
  }

  renderApp();
};

void bootstrap();
