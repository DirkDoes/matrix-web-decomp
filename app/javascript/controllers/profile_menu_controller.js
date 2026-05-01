import { Controller } from "@hotwired/stimulus";

export default class extends Controller {
  connect() {
    this.summary = this.element.querySelector("summary");

    this.toggleFromSummary = (event) => {
      event.preventDefault();
      this.element.open = !this.element.open;
    };

    this.toggleFromKeyboard = (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;

      event.preventDefault();
      this.element.open = !this.element.open;
    };

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

    this.summary?.addEventListener("click", this.toggleFromSummary);
    this.summary?.addEventListener("keydown", this.toggleFromKeyboard);
    document.addEventListener("pointerdown", this.closeOnOutsidePointerDown, true);
    document.addEventListener("keydown", this.closeOnEscape);
    document.addEventListener("turbo:frame-load", this.closeOnFrameLoad);
  }

  disconnect() {
    this.summary?.removeEventListener("click", this.toggleFromSummary);
    this.summary?.removeEventListener("keydown", this.toggleFromKeyboard);
    document.removeEventListener("pointerdown", this.closeOnOutsidePointerDown, true);
    document.removeEventListener("keydown", this.closeOnEscape);
    document.removeEventListener("turbo:frame-load", this.closeOnFrameLoad);
  }
}
