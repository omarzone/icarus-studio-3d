import "@fontsource-variable/inter";
import "@fontsource/jetbrains-mono";
import "./app/styles.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/app.tsx";
import { DesignGallery, GALLERY_PREFIX, galleryEnabled } from "./design-gallery/design-gallery.tsx";

const root = document.getElementById("root");
if (root) {
  const galleryId =
    galleryEnabled() && location.hash.startsWith(GALLERY_PREFIX) ? location.hash.slice(GALLERY_PREFIX.length) : null;
  createRoot(root).render(<StrictMode>{galleryId ? <DesignGallery id={galleryId} /> : <App />}</StrictMode>);
}
