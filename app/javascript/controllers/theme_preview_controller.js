import { Controller } from "@hotwired/stimulus";

export default class extends Controller {
  static values = { initial: String };

  connect() {
    this.submitted = false;
  }

  change(event) {
    if (!event.target.matches("input[type='radio'][name='user[theme_preference]']")) return;

    this.apply(event.target.value);
  }

  submit() {
    this.submitted = true;
  }

  disconnect() {
    if (!this.submitted) this.apply(this.initialValue || "system");
  }

  apply(theme) {
    const nextTheme = ["system", "light", "dark"].includes(theme) ? theme : "system";

    document.body.classList.remove("theme-system", "theme-light", "theme-dark");
    document.body.classList.add(`theme-${nextTheme}`);
  }
}
