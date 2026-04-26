import { Application } from "@hotwired/stimulus";

const application = Application.start();

import ProfileMenuController from "controllers/profile_menu_controller";
application.register("profile-menu", ProfileMenuController);

import RotatingCubeController from "controllers/rotating_cube_controller";
application.register("rotating-cube", RotatingCubeController);

import SidebarController from "controllers/sidebar_controller";
application.register("sidebar", SidebarController);

import ThemePreviewController from "controllers/theme_preview_controller";
application.register("theme-preview", ThemePreviewController);
