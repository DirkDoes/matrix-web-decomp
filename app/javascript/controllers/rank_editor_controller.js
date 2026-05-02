import { Controller } from "@hotwired/stimulus";

const MODE_STORAGE_KEY = "detrix.rankEffectMode";
const VALID_MODES = ["unapplied", "change", "applied"];

export default class extends Controller {
  static targets = ["form", "list", "rank", "baseRow", "mode", "sequence", "label", "badge"];
  static values = {
    viewerSelector: String,
    initialRankId: String
  };

  connect() {
    this.draggedRank = null;
    this.updateRankOrder();
    this.syncModeButtons(this.preferredMode());
    this.selectRank(this.initialRankTarget());
    this.updateSolvedBadge();
  }

  initialRankTarget() {
    if (this.hasInitialRankIdValue && this.initialRankIdValue) {
      const rank = this.rankTargets.find((target) => target.dataset.rankId === this.initialRankIdValue);

      if (rank) return rank;
    }

    return this.rankTargets[0];
  }

  select(event) {
    if (event.target.closest("button")) return;

    this.save();
    this.selectRank(event.currentTarget);
  }

  selectBase(event) {
    event?.preventDefault();
    const controller = this.viewerController();

    this.save();
    this.rankTargets.forEach((target) => target.classList.remove("active"));
    this.baseRowTarget.classList.add("active");
    controller?.loadBaseTensor();
  }

  selectRank(rankTarget, attempt = 0) {
    if (!rankTarget) return;

    const viewer = document.querySelector(this.viewerSelectorValue);
    if (!viewer) return;

    const controller = this.application.getControllerForElementAndIdentifier(viewer, "tensor-viewer");

    if (!controller) {
      if (attempt < 20) window.setTimeout(() => this.selectRank(rankTarget, attempt + 1), 25);
      return;
    }

    const vectorInput = document.querySelector(rankTarget.dataset.vectorInputSelector);
    const previousVectors = this.rankTargets
      .slice(0, this.rankTargets.indexOf(rankTarget))
      .map((target) => this.parseVectors(document.querySelector(target.dataset.vectorInputSelector)?.value));

    this.rankTargets.forEach((target) => {
      target.classList.toggle("active", target === rankTarget);
    });
    this.baseRowTarget.classList.remove("active");
    controller.loadRankVectors(this.parseVectors(vectorInput?.value), rankTarget.dataset.vectorInputSelector, previousVectors);
    controller.setRankEffectMode(this.preferredMode());
    this.updateSolvedBadge();
  }

  setMode(event) {
    const mode = event.currentTarget.dataset.mode;
    const controller = this.viewerController();

    this.storePreferredMode(mode);
    this.syncModeButtons(mode);
    controller?.setRankEffectMode(mode);
  }

  rankVectorsChanged() {
    this.updateSolvedBadge();
  }

  viewerController() {
    const viewer = document.querySelector(this.viewerSelectorValue);

    if (!viewer) return null;

    return this.application.getControllerForElementAndIdentifier(viewer, "tensor-viewer");
  }

  preferredMode() {
    const mode = window.localStorage?.getItem(MODE_STORAGE_KEY);

    return VALID_MODES.includes(mode) ? mode : "unapplied";
  }

  storePreferredMode(mode) {
    if (!VALID_MODES.includes(mode)) return;

    window.localStorage?.setItem(MODE_STORAGE_KEY, mode);
  }

  syncModeButtons(mode) {
    this.modeTargets.forEach((target) => {
      target.classList.toggle("active", target.dataset.mode === mode);
    });
  }

  labelFocus(event) {
    const input = event.currentTarget;

    if (input.dataset.generatedLabel === "true") input.select();
  }

  labelBlur(event) {
    this.normalizeLabel(event.currentTarget);
    this.save(event);
  }

  save(event) {
    event?.preventDefault();
    this.saveRanks();
  }

  addRank(event) {
    event.preventDefault();
    event.stopPropagation();
    this.saveRanks().then(() => this.postAndVisit(event.currentTarget.dataset.url));
  }

  removeRank(event) {
    event.preventDefault();
    event.stopPropagation();

    if (!window.confirm("Remove this rank?")) return;

    this.saveRanks().then(() => this.deleteAndVisit(event.currentTarget.dataset.url));
  }

  dragStart(event) {
    this.draggedRank = event.currentTarget;
    this.save();
    this.selectRank(this.draggedRank);
    event.currentTarget.classList.add("is-dragging");
    event.dataTransfer.effectAllowed = "move";
  }

  dragOver(event) {
    event.preventDefault();
    const target = event.currentTarget;

    if (!this.draggedRank || target === this.draggedRank) return;

    const targetBounds = target.getBoundingClientRect();
    const insertAfter = event.clientY > targetBounds.top + targetBounds.height / 2;

    this.animateRankReorder(() => {
      this.listTarget.insertBefore(this.draggedRank, insertAfter ? target.nextSibling : target);
      this.updateRankOrder();
    });
  }

  drop(event) {
    event.preventDefault();
    this.updateRankOrder();
    this.selectRank(this.rankTargets.find((rank) => rank.classList.contains("active")));
    this.saveRanks();
  }

  dragEnd(event) {
    event.currentTarget.classList.remove("is-dragging");
    this.draggedRank = null;
  }

  updateRankOrder() {
    this.rankTargets.forEach((rank, index) => {
      const sequenceInput = rank.querySelector('input[name$="[sequence]"]');
      const labelInput = rank.querySelector('input[name$="[label]"]');

      if (sequenceInput) sequenceInput.value = index + 1;
      if (labelInput?.dataset.generatedLabel === "true") labelInput.value = `Rank ${index + 1}`;
    });
  }

  normalizeLabel(input) {
    const rank = input.closest("[data-rank-editor-target='rank']");
    const index = this.rankTargets.indexOf(rank);
    const generatedLabel = `Rank ${index + 1}`;

    input.dataset.generatedLabel = input.value.trim() === "" || input.value.trim().toLowerCase() === generatedLabel.toLowerCase();
    if (input.dataset.generatedLabel === "true") input.value = generatedLabel;
  }

  animateRankReorder(callback) {
    const previousBounds = new Map(this.rankTargets.map((rank) => [rank, rank.getBoundingClientRect()]));

    callback();

    this.rankTargets.forEach((rank) => {
      const previous = previousBounds.get(rank);
      if (!previous) return;

      const current = rank.getBoundingClientRect();
      const deltaY = previous.top - current.top;

      if (Math.abs(deltaY) < 1) return;

      rank.style.transition = "none";
      rank.style.transform = `translateY(${deltaY}px)`;
      rank.getBoundingClientRect();
      rank.style.transition = "transform 160ms ease";
      rank.style.transform = "";
      window.setTimeout(() => {
        rank.style.removeProperty("transition");
        rank.style.removeProperty("transform");
      }, 180);
    });
  }

  saveRanks() {
    if (!this.hasFormTarget) return Promise.resolve();

    this.updateRankOrder();
    this.labelTargets.forEach((input) => this.normalizeLabel(input));
    this.updateSolvedBadge();

    return fetch(this.formTarget.action, {
      method: "PATCH",
      headers: {
        "Accept": "application/json",
        "X-CSRF-Token": this.csrfToken()
      },
      body: new FormData(this.formTarget)
    }).then((response) => {
      if (!response.ok) throw new Error("Could not save ranks.");

      return response;
    });
  }

  postAndVisit(url) {
    return fetch(url, {
      method: "POST",
      headers: {
        "Accept": "text/vnd.turbo-stream.html, text/html",
        "X-CSRF-Token": this.csrfToken()
      }
    }).then((response) => this.visitResponse(response));
  }

  deleteAndVisit(url) {
    return fetch(url, {
      method: "DELETE",
      headers: {
        "Accept": "text/vnd.turbo-stream.html, text/html",
        "X-CSRF-Token": this.csrfToken()
      }
    }).then((response) => this.visitResponse(response));
  }

  visitResponse(response) {
    if (response.redirected) {
      window.Turbo?.visit(response.url) || window.location.assign(response.url);
      return;
    }

    window.location.reload();
  }

  csrfToken() {
    return document.querySelector('meta[name="csrf-token"]')?.content || "";
  }

  parseVectors(value) {
    try {
      return JSON.parse(value || "{}");
    } catch (_error) {
      return {};
    }
  }

  updateSolvedBadge() {
    if (!this.hasBadgeTarget) return;

    const solved = this.solvedByCurrentRanks();

    this.badgeTarget.classList.toggle("is-solved", solved);
    this.badgeTarget.classList.toggle("is-unsolved", !solved);
    this.badgeTarget.textContent = solved ? "Solved" : "Unsolved";
  }

  solvedByCurrentRanks() {
    const controller = this.viewerController();

    if (!controller) return false;

    const tensor = controller.normalizedTensor(controller.decompositionTensor);
    const rankVectors = this.rankTargets.map((target) => (
      this.parseVectors(document.querySelector(target.dataset.vectorInputSelector)?.value)
    ));
    const result = controller.applyRankVectorsToTensor(tensor, rankVectors);

    return result.flat(2).every((value) => Number.parseInt(value, 10) === 0);
  }
}
