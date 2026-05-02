import { Application } from "@hotwired/stimulus";

const application = Application.start();

import ProfileMenuController from "controllers/profile_menu_controller";
application.register("profile-menu", ProfileMenuController);

import TensorViewerController from "controllers/tensor_viewer_controller";
application.register("tensor-viewer", TensorViewerController);

import TensorFormController from "controllers/tensor_form_controller";
application.register("tensor-form", TensorFormController);

import RankEditorController from "controllers/rank_editor_controller";
application.register("rank-editor", RankEditorController);

import SidebarController from "controllers/sidebar_controller";
application.register("sidebar", SidebarController);
