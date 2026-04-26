pin "main"
pin "controllers", to: "controllers/index.js"
pin_all_from "app/javascript/controllers", under: "controllers"

pin "@hotwired/stimulus", to: "https://cdn.jsdelivr.net/npm/@hotwired/stimulus@3.2.2/+esm"
pin "@hotwired/turbo", to: "https://cdn.jsdelivr.net/npm/@hotwired/turbo@8/+esm"
pin "three", to: "https://cdn.jsdelivr.net/npm/three@0.165.0/build/three.module.js"
