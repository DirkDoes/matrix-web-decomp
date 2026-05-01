import { Controller } from "@hotwired/stimulus";

export default class extends Controller {
  static targets = [
    "xInput",
    "yInput",
    "zInput",
    "tensorInput",
    "preview",
    "templateSelect",
    "customFields",
    "multiplicationFields",
    "templateMessage",
    "aRowsInput",
    "aColumnsInput",
    "bRowsInput",
    "bColumnsInput"
  ];
  static values = {
    templatePreviewUrl: String
  };

  connect() {
    this.element.addEventListener("tensor-value-change", this.updateTensorInput);
    this.element.addEventListener("submit", this.validateBeforeSubmit);
    this.syncMirroredMatrixDimension();
    this.toggleTemplateFields(this.templateSelectTarget.value);
    this.updateTemplateMessage();
    this.updatePreviewTensor();
  }

  disconnect() {
    this.element.removeEventListener("tensor-value-change", this.updateTensorInput);
    this.element.removeEventListener("submit", this.validateBeforeSubmit);
  }

  update() {
    const previewController = this.application.getControllerForElementAndIdentifier(this.previewTarget, "tensor-viewer");
    const tensor = this.blankTensor(
      this.dimensionValue(this.xInputTarget),
      this.dimensionValue(this.yInputTarget),
      this.dimensionValue(this.zInputTarget)
    );

    previewController?.updateDimensions(
      this.dimensionValue(this.xInputTarget),
      this.dimensionValue(this.yInputTarget),
      this.dimensionValue(this.zInputTarget)
    );
    previewController?.updateTensor(tensor);
    this.tensorInputTarget.value = JSON.stringify(tensor);
  }

  templateChanged() {
    const template = this.templateSelectTarget.value;

    this.toggleTemplateFields(template);
    this.updateTemplateMessage();

    if (template === "custom") {
      this.update();
    } else {
      this.templateDimensionChanged();
    }
  }

  templateDimensionChanged() {
    if (this.templateSelectTarget.value !== "multiplication") return;

    this.syncMirroredMatrixDimension();
    if (!this.updateTemplateMessage()) return;

    const body = new FormData();
    body.append("a_rows", this.dimensionValue(this.aRowsInputTarget));
    body.append("a_columns", this.dimensionValue(this.aColumnsInputTarget));
    body.append("b_rows", this.dimensionValue(this.bRowsInputTarget));
    body.append("b_columns", this.dimensionValue(this.bColumnsInputTarget));

    fetch(this.templatePreviewUrlValue, {
      method: "POST",
      headers: { "X-CSRF-Token": document.querySelector("meta[name='csrf-token']")?.content || "" },
      body
    })
      .then((response) => response.ok ? response.json() : null)
      .then((preview) => {
        if (!preview) return;

        this.applyTensorPayload(preview);

        const previewController = this.application.getControllerForElementAndIdentifier(this.previewTarget, "tensor-viewer");

        previewController?.updateDimensions(preview.x_count, preview.y_count, preview.z_count);
        previewController?.updateTensor(preview.tensor);
      });
  }

  updateTensorInput = (event) => {
    const tensor = event.detail.tensor;

    this.templateSelectTarget.value = "custom";
    this.toggleTemplateFields("custom");
    this.updateTemplateMessage();
    this.applyTensorPayload({
      x_count: tensor?.[0]?.[0]?.length || 1,
      y_count: tensor?.[0]?.length || 1,
      z_count: tensor?.length || 1,
      tensor
    });
  };

  validateBeforeSubmit = (event) => {
    if (this.templateSelectTarget.value !== "multiplication") return;
    this.syncMirroredMatrixDimension();

    if (this.updateTemplateMessage()) return;

    event.preventDefault();
  };

  toggleTemplateFields(template) {
    this.customFieldsTarget.hidden = template !== "custom";
    this.multiplicationFieldsTarget.hidden = template !== "multiplication";
  }

  updateTemplateMessage() {
    if (this.templateSelectTarget.value !== "multiplication") {
      this.templateMessageTarget.hidden = true;
      this.templateMessageTarget.textContent = "";
      return true;
    }

    this.syncMirroredMatrixDimension();

    const message = this.multiplicationValidationMessage();

    if (!message) {
      this.templateMessageTarget.hidden = true;
      this.templateMessageTarget.textContent = "";
      return true;
    }

    this.templateMessageTarget.hidden = false;
    this.templateMessageTarget.textContent = message;
    return false;
  }

  applyTensorPayload(payload) {
    this.xInputTarget.value = payload.x_count;
    this.yInputTarget.value = payload.y_count;
    this.zInputTarget.value = payload.z_count;
    this.tensorInputTarget.value = JSON.stringify(payload.tensor);
  }

  updatePreviewTensor() {
    const previewController = this.application.getControllerForElementAndIdentifier(this.previewTarget, "tensor-viewer");

    previewController?.updateTensor(JSON.parse(this.tensorInputTarget.value || "[]"));
  }

  blankTensor(xCount, yCount, zCount) {
    return Array.from({ length: zCount }, () => (
      Array.from({ length: yCount }, () => Array.from({ length: xCount }, () => 0))
    ));
  }

  dimensionValue(input) {
    return Number.parseInt(input.value, 10) || 1;
  }

  dimensionMax() {
    return Number.parseInt(this.xInputTarget.max, 10) || 50;
  }

  syncMirroredMatrixDimension() {
    if (!this.hasAColumnsInputTarget || !this.hasBRowsInputTarget) return;

    this.bRowsInputTarget.value = this.dimensionValue(this.aColumnsInputTarget);
  }

  multiplicationAxisCounts() {
    const aRows = this.dimensionValue(this.aRowsInputTarget);
    const aColumns = this.dimensionValue(this.aColumnsInputTarget);
    const bRows = this.dimensionValue(this.bRowsInputTarget);
    const bColumns = this.dimensionValue(this.bColumnsInputTarget);

    return {
      x: aRows * bColumns,
      y: aRows * aColumns,
      z: bRows * bColumns
    };
  }

  multiplicationValidationMessage() {
    if (this.dimensionValue(this.aColumnsInputTarget) !== this.dimensionValue(this.bRowsInputTarget)) {
      return "Matrix multiplication requires Matrix A columns to equal Matrix B rows.";
    }

    const max = this.dimensionMax();
    const axes = this.multiplicationAxisCounts();

    if (Object.values(axes).some((count) => count > max)) {
      return `Generated tensor axes must be ${max} or less. Current size would be ${axes.x} x ${axes.y} x ${axes.z}.`;
    }

    return "";
  }
}
