import { Controller } from "@hotwired/stimulus";

export default class extends Controller {
  static targets = ["item"];

  connect() {
    this.frameLoaded = () => this.syncFromLocation();
    document.addEventListener("turbo:frame-load", this.frameLoaded);
  }

  disconnect() {
    document.removeEventListener("turbo:frame-load", this.frameLoaded);
  }

  select(event) {
    this.activate(event.currentTarget.dataset.sidebarKey);
  }

  syncFromLocation() {
    const path = window.location.pathname;
    const key = this.keyForPath(path);
    const item = this.itemTargets.find((target) => target.dataset.sidebarKey === key);

    if (!item || item.classList.contains("active")) return;

    this.activate(key);
  }

  activate(key) {
    this.itemTargets.forEach((target) => {
      target.classList.toggle("active", target.dataset.sidebarKey === key);
    });
  }

  keyForPath(path) {
    if (path.startsWith("/settings")) return "settings";
    if (path.startsWith("/tensors")) return "tensors";
    if (path.startsWith("/decompositions")) return "decompositions";

    return "tensors";
  }
}
