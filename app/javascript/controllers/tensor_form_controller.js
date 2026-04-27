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
    this.toggleTemplateFields(this.templateSelectTarget.value);
    this.updateTemplateMessage();
    this.updatePreviewTensor();
  }

  disconnect() {
    this.element.removeEventListener("tensor-value-change", this.updateTensorInput);
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

    this.updateTemplateMessage();

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

  toggleTemplateFields(template) {
    this.customFieldsTarget.hidden = template !== "custom";
    this.multiplicationFieldsTarget.hidden = template !== "multiplication";
  }

  updateTemplateMessage() {
    if (this.templateSelectTarget.value !== "multiplication") {
      this.templateMessageTarget.hidden = true;
      this.templateMessageTarget.textContent = "";
      return;
    }

    if (this.multiplicationValid()) {
      this.templateMessageTarget.hidden = true;
      this.templateMessageTarget.textContent = "";
      return;
    }

    this.templateMessageTarget.hidden = false;
    this.templateMessageTarget.textContent = "Matrix multiplication requires Matrix A columns to equal Matrix B rows.";
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

  multiplicationValid() {
    return this.dimensionValue(this.aColumnsInputTarget) === this.dimensionValue(this.bRowsInputTarget);
  }
}
