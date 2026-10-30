import "@fontsource-variable/inter";
import "@fontsource/jetbrains-mono";
import "./app/styles.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/app.tsx";
import {
  DesignGallery,
  GALLERY_PREFIX,
  galleryEnabled,
  PROTOTYPE_PREFIX,
  Prototype,
} from "./design-gallery/design-gallery.tsx";

const root = document.getElementById("root");
if (root) {
  const hash = galleryEnabled() ? location.hash : "";
  const view = hash.startsWith(GALLERY_PREFIX) ? (
    <DesignGallery id={hash.slice(GALLERY_PREFIX.length)} />
  ) : hash.startsWith(PROTOTYPE_PREFIX) ? (
    <Prototype start={hash.slice(PROTOTYPE_PREFIX.length)} />
  ) : (
    <App />
  );
  createRoot(root).render(<StrictMode>{view}</StrictMode>);
}
