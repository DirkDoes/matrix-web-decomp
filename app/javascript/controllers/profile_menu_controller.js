import { Controller } from "@hotwired/stimulus";

export default class extends Controller {
  connect() {
    this.closeOnOutsidePointerDown = (event) => {
      if (this.element.open && !this.element.contains(event.target)) {
        this.element.open = false;
      }
    };

    this.closeOnEscape = (event) => {
      if (event.key === "Escape") this.element.open = false;
    };

    this.closeOnFrameLoad = () => {
      this.element.open = false;
    };

    document.addEventListener("pointerdown", this.closeOnOutsidePointerDown, true);
    document.addEventListener("keydown", this.closeOnEscape);
    document.addEventListener("turbo:frame-load", this.closeOnFrameLoad);
  }

  disconnect() {
    document.removeEventListener("pointerdown", this.closeOnOutsidePointerDown, true);
    document.removeEventListener("keydown", this.closeOnEscape);
    document.removeEventListener("turbo:frame-load", this.closeOnFrameLoad);
  }
}
