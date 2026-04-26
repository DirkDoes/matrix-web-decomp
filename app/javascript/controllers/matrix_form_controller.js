import { Controller } from "@hotwired/stimulus";

export default class extends Controller {
  static targets = ["xInput", "yInput", "zInput", "preview"];

  update() {
    const previewController = this.application.getControllerForElementAndIdentifier(this.previewTarget, "matrix-preview");

    previewController?.updateDimensions(
      this.dimensionValue(this.xInputTarget),
      this.dimensionValue(this.yInputTarget),
      this.dimensionValue(this.zInputTarget)
    );
  }

  dimensionValue(input) {
    return Number.parseInt(input.value, 10) || 1;
  }
}
