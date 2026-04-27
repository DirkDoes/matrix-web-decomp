import { Application } from "@hotwired/stimulus";

const application = Application.start();

import ProfileMenuController from "controllers/profile_menu_controller";
application.register("profile-menu", ProfileMenuController);

import MatrixViewerController from "controllers/matrix_viewer_controller";
application.register("matrix-viewer", MatrixViewerController);

import MatrixFormController from "controllers/matrix_form_controller";
application.register("matrix-form", MatrixFormController);

import MatrixPreviewController from "controllers/matrix_preview_controller";
application.register("matrix-preview", MatrixPreviewController);

import SidebarController from "controllers/sidebar_controller";
application.register("sidebar", SidebarController);

import ThemePreviewController from "controllers/theme_preview_controller";
application.register("theme-preview", ThemePreviewController);
