// Copyright (c) 2015, Frappe Technologies Pvt. Ltd. and Contributors
// MIT License. See license.txt

/**
 * Make a standard page layout with a toolbar and title
 *
 * @param {Object} opts
 *
 * @param {string} opts.parent [HTMLElement] Parent element
 * @param {boolean} opts.single_column Whether to include sidebar
 * @param {string} [opts.title] Page title
 * @param {Object} [opts.make_page]
 *
 * @returns {frappe.ui.Page}
 */

/**
 * @typedef {Object} frappe.ui.Page
 */

frappe.ui.make_app_page = function (opts) {
	opts.parent.page = new frappe.ui.Page(opts);
	return opts.parent.page;
};

frappe.ui.pages = {};

frappe.ui.Page = class Page{
	constructor(opts) {
		$.extend(this, opts);

		this.set_document_title = true;
		this.show_global_sidebar = this.title !== "Workspace";
		this.buttons = {};
		this.fields_dict = {};
		this.views = {};
		// this.isVisibleSidebarToggleButton = true;
		this.pages = {};
		this.sorted_public_items = [];
		this.sorted_private_items = [];
		this.sidebar_items = {
			public: {},
			private: {},
		};    
		this.sidebar_categories = ["My Workspaces", "Public"];
		this.indicator_colors = [
			"green",
			"cyan",
			"blue",
			"orange",
			"yellow",
			"gray",
			"grey",
			"red",
			"pink",
			"darkgrey",
			"purple",
			"light-blue",
		];

		this.make();
		// if (this.show_global_sidebar) {
			this.prepare_sidebar_wrap();
		// }
		this.setup_pages();
		frappe.ui.pages[frappe.get_route_str()] = this;
	}

	prepare_sidebar_wrap() {
		let list_sidebar = $(`
			<div class="list-sidebar overlay-sidebar hidden-xs hidden-sm">
				<div class="desk-sidebar list-unstyled sidebar-menu"></div>
			</div>
		`).appendTo(this.wrapper.find(".layout-side-section"));
		this.sidebar = list_sidebar.find(".desk-sidebar");
	}

	async setup_pages(reload) {
		// !this.discard && this.create_page_skeleton();
		!this.discard && this.create_sidebar_skeleton();
		this.sidebar_pages = !this.discard ? await this.get_pages() : this.sidebar_pages;
		this.cached_pages = $.extend(true, {}, this.sidebar_pages);
		this.all_pages = this.sidebar_pages.pages;
		this.has_access = this.sidebar_pages.has_access;

		this.all_pages.forEach((page) => {
			page.is_editable = !page.public || this.has_access;
		});

		this.public_pages = this.all_pages.filter((page) => page.public);
		this.private_pages = this.all_pages.filter((page) => !page.public);

		if (this.all_pages) {
			frappe.workspaces = {};
			for (let page of this.all_pages) {
				frappe.workspaces[frappe.router.slug(page.name)] = {
					title: page.title,
					public: page.public,
				};
			}
			if (this.show_global_sidebar) {
				this.make_sidebar();
			} 
			reload && this.show();
		}
	}

	create_sidebar_skeleton() {
		if ($(".workspace-sidebar-skeleton").length) return;

		$(frappe.render_template("workspace_sidebar_loading_skeleton")).insertBefore(this.sidebar);
		this.sidebar.addClass("hidden");
	}

	get_pages() {
		return frappe.xcall("frappe.desk.desktop.get_workspace_sidebar_items");
	}

	show() {
		if (!this.all_pages) {
			// pages not yet loaded, call again after a bit
			setTimeout(() => this.show(), 100);
			return;
		}

		let page = this.get_page_to_show();

		if (!frappe.router.current_route[0]) {
			frappe.route_flags.replace_route = true;
			frappe.set_route(frappe.router.slug(page.public ? page.name : "private/" + page.name));
			return;
		}

		this.page.set_title(__(page.name));
		this.update_selected_sidebar(this.current_page, false); //remove selected from old page
		this.update_selected_sidebar(page, true); //add selected on new page
		this.show_page(page);
	}

	make_sidebar() {
		if (this.sidebar.find(".standard-sidebar-section")[0]) {
			this.sidebar.find(".standard-sidebar-section").remove();
		}

		this.sidebar_categories.forEach((category) => {
			let root_pages = this.public_pages.filter(
				(page) => page.parent_page == "" || page.parent_page == null
			);
			if (category != "Public") {
				root_pages = this.private_pages.filter(
					(page) => page.parent_page == "" || page.parent_page == null
				);
			}
			root_pages = root_pages.uniqBy((d) => d.title);
			this.build_sidebar_section(category, root_pages);
		});

		// Scroll sidebar to selected page if it is not in viewport.
		this.sidebar.find(".selected").length &&
			!frappe.dom.is_element_in_viewport(this.sidebar.find(".selected")) &&
			this.sidebar.find(".selected")[0].scrollIntoView();

		this.remove_sidebar_skeleton();
		this.setup_sidebar_toggle(".layout-side-section", $(".layout-side-section").parent(), this.sidebar);
		this.showSidebarToggleButton();
	}

	remove_sidebar_skeleton() {
		this.sidebar.removeClass("hidden");
		$(".workspace-sidebar-skeleton").remove();
	}

	build_sidebar_section(title, root_pages) {
		let sidebar_section = $(
			`<div class="standard-sidebar-section nested-container" data-title="${title}"></div>`
		);

		let $title = $(`<div class="standard-sidebar-label">
			<span>${frappe.utils.icon("es-line-down", "xs")}</span>
			<span class="section-title">${__(title)}<span>
		</div>`).appendTo(sidebar_section);
		this.prepare_sidebar(root_pages, sidebar_section, this.sidebar);

		$title.on("click", (e) => {
			let icon =
				$(e.target).find("span use").attr("href") === "#es-line-down"
					? "#es-line-right-chevron"
					: "#es-line-down";
			$(e.target).find("span use").attr("href", icon);
			$(e.target).parent().find(".sidebar-item-container").toggleClass("hidden");
		});

		if (Object.keys(root_pages).length === 0) {
			sidebar_section.addClass("hidden");
		}

		if (
			sidebar_section.find(".sidebar-item-container").length &&
			sidebar_section.find("> [item-is-hidden='0']").length == 0
		) {
			sidebar_section.addClass("hidden show-in-edit-mode");
		}
	}
	prepare_sidebar(items, child_container, item_container) {
		items.forEach((item) => this.append_item(item, child_container));
		child_container.appendTo(item_container);
	}

	append_item(item, container) {
		let is_current_page =
			frappe.router.slug(item.title) == frappe.router.slug(this.get_page_to_show().name) &&
			item.public == this.get_page_to_show().public;
		item.selected = is_current_page;
		if (is_current_page) {
			this.current_page = { name: item.title, public: item.public };
		}

		let $item_container = this.sidebar_item_container(item);
		let sidebar_control = $item_container.find(".sidebar-item-control");

		// this.add_sidebar_actions(item, sidebar_control);
		let pages = item.public ? this.public_pages : this.private_pages;

		let child_items = pages.filter((page) => page.parent_page == item.title);
		if (child_items.length > 0) {
			let child_container = $item_container.find(".sidebar-child-item");
			child_container.addClass("hidden");
			this.prepare_sidebar(child_items, child_container, $item_container);
		}

		$item_container.appendTo(container);
		this.sidebar_items[item.public ? "public" : "private"][item.title] = $item_container;

		if ($item_container.parent().hasClass("hidden") && is_current_page) {
			$item_container.parent().toggleClass("hidden");
		}

		// this.add_drop_icon(item, sidebar_control, $item_container);

		if (child_items.length > 0) {
			$item_container.find(".drop-icon").first().addClass("show-in-edit-mode");
		}
	}

	get_page_to_show() {
		let default_page;

		if (
			localStorage.current_page &&
			this.all_pages.filter((page) => page.title == localStorage.current_page).length != 0
		) {
			default_page = {
				name: localStorage.current_page,
				public: localStorage.is_current_page_public != "false",
			};
		} else if (Object.keys(this.all_pages).length !== 0) {
			default_page = { name: this.all_pages[0].title, public: this.all_pages[0].public };
		} else {
			default_page = { name: "Build", public: true };
		}

		const route = frappe.get_route();
		const page = (route[1] == "private" ? route[2] : route[1]) || default_page.name;
		const is_public = route[1] ? route[1] != "private" : default_page.public;
		return { name: page, public: is_public };
	}

	sidebar_item_container(item) {
		item.indicator_color =
			item.indicator_color || this.indicator_colors[0];

		return $(`
			<div
				class="sidebar-item-container ${item.is_editable ? "is-draggable" : ""}"
				item-parent="${item.parent_page}"
				item-name="${item.title}"
				item-public="${item.public || 0}"
				item-is-hidden="${item.is_hidden || 0}"
			>
				<div class="desk-sidebar-item standard-sidebar-item ${item.selected ? "selected" : ""}">
					<a
						href="/app/${
							item.public
								? frappe.router.slug(item.title)
								: "private/" + frappe.router.slug(item.title)
						}"
						class="item-anchor ${item.is_editable ? "" : "block-click"}" title="${__(item.title)}"
					>
						<span class="sidebar-item-icon" item-icon=${item.icon || "folder-normal"}>
							${
								item.public
									? frappe.utils.icon(item.icon || "folder-normal", "md")
									: `<span class="indicator ${item.indicator_color}"></span>`
							}
						</span>
						<span class="sidebar-item-label ${item.selected ? "selected" : ""}">${__(item.title)}<span>
					</a>
				</div>
				<div class="sidebar-child-item nested-container"></div>
			</div>
		`);
	}

	add_sidebar_actions(item, sidebar_control, is_new) {
		if (!item.is_editable) {
			sidebar_control.parent().click(() => {
				!this.is_read_only &&
					frappe.show_alert(
						{
							message: __("Only Workspace Manager can sort or edit this page"),
							indicator: "info",
						},
						5
					);
			});

			frappe.utils.add_custom_button(
				frappe.utils.icon("es-line-duplicate", "sm"),
				() => this.duplicate_page(item),
				"duplicate-page",
				__("Duplicate Workspace"),
				null,
				sidebar_control
			);
		} else if (item.is_hidden) {
			frappe.utils.add_custom_button(
				frappe.utils.icon("es-line-preview", "sm"),
				(e) => this.unhide_workspace(item, e),
				"unhide-workspace-btn",
				__("Unhide Workspace"),
				null,
				sidebar_control
			);
		} else {
			frappe.utils.add_custom_button(
				frappe.utils.icon("es-line-drag", "xs"),
				null,
				"drag-handle",
				__("Drag"),
				null,
				sidebar_control
			);

			// !is_new && this.add_settings_button(item, sidebar_control);
		}
	}

	

	make() {
		this.wrapper = $(this.parent);
		this.add_main_section();
		this.setup_scroll_handler();
		// this.setup_sidebar_toggle(".layout-side-section", $(".page-head"), this.sidebar);
		this.setup_sidebar_toggle(".layout-page-side-section", $(".page-side-head", this.page_sidebar));
		$(window).on("resize", this.showSidebarToggleButton)

	}

	setup_scroll_handler() {
		let last_scroll = 0;
		$(window).scroll(
			frappe.utils.throttle(() => {
				$(".page-head").toggleClass("drop-shadow", !!document.documentElement.scrollTop);
				let current_scroll = document.documentElement.scrollTop;
				if (current_scroll > 0 && last_scroll <= current_scroll) {
					$(".page-head").css("top", "-15px");
				} else {
					$(".page-head").css("top", "var(--navbar-height)");
				}
				last_scroll = current_scroll;
			}, 500)
		);
	}

	get_empty_state(title, message, primary_action) {
		return $(`<div class="page-card-container">
  			<div class="page-card">
  				<div class="page-card-head">
  					<span class="indicator blue">
  						${title}</span>
  				</div>
  				<p>${message}</p>
  				<div>
  					<button class="btn btn-primary btn-sm">${primary_action}</button>
  				</div>
  			</div>
  		</div>`);
	}

	load_lib(callback) {
		frappe.require(this.required_libs, callback);
	}

	showSidebarToggleButton() {
		const isMobile = frappe.is_mobile() || (window.innerWidth < 992);
		const isDesk = frappe.get_route().includes("Workspaces");

		if (isMobile || !isDesk) {
			return document.querySelector(".sidebar-toggle-btn-internal")?.classList.add("d-none")
		}

		return document.querySelector(".sidebar-toggle-btn-internal")?.classList.remove("d-none")
	}

	add_main_section() {
		$(frappe.render_template("page", {})).appendTo(this.wrapper);
		if (this.single_column) {
			// nesting under col-sm-12 for consistency
			this.add_view(
				"main",
				'<div class="row layout-main">\
				<div class="col-lg-2 layout-side-section-wrap">\
						<div class="layout-side-section no-padding"></div>\
						<button class="btn-reset sidebar-toggle-btn-internal">\
							<span class="sidebar-toggle-icon">\
								<svg class="es-icon icon-md">\
									<use href="#es-line-sidebar-expand">\
									</use>\
								</svg>\
							</span>\
						</button>\
					</div>\
					<div class="col-lg-10 layout-main-section-wrapper">\
						<div class="layout-main-section"></div>\
						<div class="layout-footer hide"></div>\
					</div>\
				</div>'
			);
		} else {
			this.add_view(
				"main",
				`
				<div class="row layout-main">
					<div class="col-lg-2 layout-side-section-wrap">
						<div class="layout-side-section no-padding"></div>
						<button class="btn-reset sidebar-toggle-btn-internal">
							<span class="sidebar-toggle-icon">
								<svg class="es-icon icon-md">
									<use href="#es-line-sidebar-expand">
									</use>
								</svg>
							</span>
						</button>
					</div>
					<div class="col layout-main-section-wrapper">
						<div class="d-flex flex-column layout-page-container">
							<div class="layout-page-side-head">
								<div class="page-title">
									<div class="flex fill-width title-area">
										<div>
											<div class="flex">
												<h3 class="ellipsis title-text"></h3>
												<span class="indicator-pill whitespace-nowrap"></span>
											</div>
											<div class="ellipsis sub-heading hide text-muted"></div>
										</div>
										<button class="btn btn-default more-button hide">
											<svg class="icon icon-sm">
												<use href="#icon-dot-horizontal">
												</use>
											</svg>
										</button>
									</div>				
								</div>			
							</div>
							<div class="d-flex flex-row">
								<div class="col-lg-2 layout-page-side-section-wrap hidden-sm hidden-xs d-none">
									<div class="layout-page-side-section"></div>
								</div>
								<div class="layout-main-section"></div>
							</div>
						</div>
						<div class="layout-footer hide"></div>
					</div>
				</div>
			`
			);
		}

		this.setup_page();
	}

	setup_page() {
		this.$title_area = this.wrapper.find(".title-area");

		this.$sub_title_area = this.wrapper.find("h6");

		if (this.title) this.set_title(this.title);

		if (this.icon) this.get_main_icon(this.icon);

		this.body = this.main = this.wrapper.find(".layout-main-section");
		this.container = this.wrapper.find(".page-body");
		this.sidebar = this.wrapper.find(".layout-side-section");
		this.page_sidebar = this.wrapper.find(".layout-page-side-section");
		this.footer = this.wrapper.find(".layout-footer");
		this.indicator = this.wrapper.find(".indicator-pill");

		this.page_actions = this.wrapper.find(".page-actions");

		this.btn_primary = this.page_actions.find(".primary-action");
		this.btn_secondary = this.page_actions.find(".btn-secondary");

		this.menu = this.page_actions.find(".menu-btn-group .dropdown-menu");
		this.menu_btn_group = this.page_actions.find(".menu-btn-group");

		this.actions = this.page_actions.find(".actions-btn-group .dropdown-menu");
		this.actions_btn_group = this.page_actions.find(".actions-btn-group");

		this.standard_actions = this.page_actions.find(".standard-actions");
		this.custom_actions = this.page_actions.find(".custom-actions");

		this.page_form = $('<div class="page-form row hide"></div>').prependTo(this.main);
		this.inner_toolbar = this.custom_actions;
		this.icon_group = this.page_actions.find(".page-icon-group");

		if (this.make_page) {
			this.make_page();
		}

		this.card_layout && this.main.addClass("frappe-card");

		// keyboard shortcuts
		let menu_btn = this.menu_btn_group.find("button");
		menu_btn.attr("title", __("Menu")).tooltip({ delay: { show: 600, hide: 100 } });
		frappe.ui.keys
			.get_shortcut_group(this.page_actions[0])
			.add(menu_btn, menu_btn.find(".menu-btn-group-label"));

		let action_btn = this.actions_btn_group.find("button");
		frappe.ui.keys
			.get_shortcut_group(this.page_actions[0])
			.add(action_btn, action_btn.find(".actions-btn-group-label"));
	}

	setup_sidebar_toggle(sidebar_wrapper_selector, toggle_btn_wrapper, sidebar) {
		let sidebar_toggle = toggle_btn_wrapper.find(".sidebar-toggle-btn-internal");
		let sidebar_wrapper = this.wrapper.find(sidebar_wrapper_selector);
		if (this.disable_sidebar_toggle || !sidebar_wrapper.length) {
			sidebar_toggle.remove();
		} else {
			sidebar_toggle.attr("title", __("Toggle Sidebar")).tooltip({
				delay: { show: 600, hide: 100 },
				trigger: "hover",
			});
			sidebar_toggle.click(() => {
				if (frappe.utils.is_xs() || frappe.utils.is_sm()) {
					this.setup_overlay_sidebar(sidebar);
				} else {
					sidebar_wrapper.toggle();
				}
				$(document.body).trigger("toggleSidebar");
				this.update_sidebar_icon(toggle_btn_wrapper);
			});
		}
	}

	setup_overlay_sidebar(sidebar) {
		sidebar.find(".close-sidebar").remove();
		let overlay_sidebar = sidebar.find(".overlay-sidebar").length !== 0
		? sidebar.find(".overlay-sidebar").addClass("opened")
		: sidebar.parent().addClass("opened");

		let closeSidebar = $('<div class="close-sidebar"></div>').hide();
		closeSidebar.appendTo(sidebar).fadeIn();
		let scroll_container = $("html").css("overflow-y", "hidden");

		sidebar.find(".close-sidebar").on("click", (e) => this.close_sidebar(e));
		sidebar.on("click", "button:not(.dropdown-toggle)", (e) => this.close_sidebar(e));

		this.close_sidebar = () => {
			scroll_container.css("overflow-y", "");
			sidebar.find("div.close-sidebar").fadeOut(() => {
				overlay_sidebar
					.removeClass("opened")
					.find(".dropdown-toggle")
					.removeClass("text-muted");
			});
		};
	}

	update_sidebar_icon(jq_wrapper) {
		let sidebar_toggle = jq_wrapper.find(".sidebar-toggle-btn");
		let sidebar_toggle_icon = sidebar_toggle.find(".sidebar-toggle-icon");
		let sidebar_wrapper = this.wrapper.find(".layout-side-section");
		let is_sidebar_visible = $(sidebar_wrapper).is(":visible");
		sidebar_toggle_icon.html(
			frappe.utils.icon(
				is_sidebar_visible ? "es-line-sidebar-collapse" : "es-line-sidebar-expand",
				"md"
			)
		);
	}

	set_indicator(label, color) {
		this.clear_indicator().removeClass("hide").html(`<span>${label}</span>`).addClass(color);
	}

	add_action_icon(icon, click, css_class = "", tooltip_label) {
		const button = $(`
			<button class="text-muted btn btn-default ${css_class} icon-btn">
				${frappe.utils.icon(icon)}
			</button>
		`);
		// ideally, we should pass tooltip_label this is just safe gaurd.
		if (!tooltip_label) {
			if (icon.startsWith("es-")) {
				icon = icon.replace("es-line-", "");
				icon = icon.replace("es-solid-", "");
				icon = icon.replace("es-small-", "");
			}
			tooltip_label = frappe.unscrub(icon);
		}

		button.appendTo(this.icon_group.removeClass("hide"));
		button.click(click);
		button
			.attr("title", __(tooltip_label))
			.tooltip({ delay: { show: 600, hide: 100 }, trigger: "hover" });

		return button;
	}

	clear_indicator() {
		return this.indicator
			.removeClass()
			.addClass("indicator-pill no-indicator-dot whitespace-nowrap hide");
	}

	get_icon_label(icon, label) {
		let icon_name = icon;
		let size = "xs";
		if (typeof icon === "object") {
			icon_name = icon.icon;
			size = icon.size || "xs";
		}
		return `${icon ? frappe.utils.icon(icon_name, size) : ""} <span class="hidden-xs"> ${__(
			label
		)} </span>`;
	}

	set_action(btn, opts) {
		let me = this;
		if (opts.icon) {
			opts.iconHTML = this.get_icon_label(opts.icon, opts.label);
		}

		this.clear_action_of(btn);

		btn.removeClass("hide")
			.prop("disabled", false)
			.html(opts.iconHTML || opts.label)
			.attr("data-label", opts.label)
			.on("click", function () {
				let response = opts.click.apply(this, [btn]);
				me.btn_disable_enable(btn, response);
			});

		if (opts.working_label) {
			btn.attr("data-working-label", opts.working_label);
		}

		// alt shortcuts
		let text_span = btn.find("span");
		frappe.ui.keys.get_shortcut_group(this).add(btn, text_span.length ? text_span : btn);
	}

	set_primary_action(label, click, icon, working_label) {
		this.set_action(this.btn_primary, {
			label: label,
			click: click,
			icon: icon,
			working_label: working_label,
		});
		return this.btn_primary;
	}

	set_secondary_action(label, click, icon, working_label) {
		this.set_action(this.btn_secondary, {
			label: label,
			click: click,
			icon: icon,
			working_label: working_label,
		});

		return this.btn_secondary;
	}

	clear_action_of(btn) {
		btn.addClass("hide").unbind("click").removeAttr("data-working-label");
	}

	clear_primary_action() {
		this.clear_action_of(this.btn_primary);
	}

	clear_secondary_action() {
		this.clear_action_of(this.btn_secondary);
	}

	clear_actions() {
		this.clear_primary_action();
		this.clear_secondary_action();
	}

	clear_custom_actions() {
		this.custom_actions.addClass("hide").empty();
	}

	clear_icons() {
		this.icon_group.addClass("hide").empty();
	}

	//--- Menu --//

	add_menu_item(label, click, standard, shortcut, show_parent) {
		return this.add_dropdown_item({
			label,
			click,
			standard,
			parent: this.menu,
			shortcut,
			show_parent,
		});
	}

	add_custom_menu_item(parent, label, click, standard, shortcut, icon = null) {
		return this.add_dropdown_item({
			label,
			click,
			standard,
			parent: parent,
			shortcut,
			icon,
		});
	}

	clear_menu() {
		this.clear_btn_group(this.menu);
	}

	show_menu() {
		this.menu_btn_group.removeClass("hide");
	}

	hide_menu() {
		this.menu_btn_group.addClass("hide");
	}

	show_icon_group() {
		this.icon_group.removeClass("hide");
	}

	hide_icon_group() {
		this.icon_group.addClass("hide");
	}

	//--- Actions Menu--//

	show_actions_menu() {
		this.actions_btn_group.removeClass("hide");
	}

	hide_actions_menu() {
		this.actions_btn_group.addClass("hide");
	}

	add_action_item(label, click, standard) {
		return this.add_dropdown_item({
			label,
			click,
			standard,
			parent: this.actions,
		});
	}

	add_actions_menu_item(label, click, standard, shortcut) {
		return this.add_dropdown_item({
			label,
			click,
			standard,
			shortcut,
			parent: this.actions,
			show_parent: false,
		});
	}

	clear_actions_menu() {
		this.clear_btn_group(this.actions);
	}

	//-- Generic --//

	/*
	 * Add label to given drop down menu. If label, is already contained in the drop
	 * down menu, it will be ignored.
	 * @param {string} label - Text for the drop down menu
	 * @param {function} click - function to be called when `label` is clicked
	 * @param {Boolean} standard
	 * @param {object} parent - DOM object representing the parent of the drop down item lists
	 * @param {string} shortcut - Keyboard shortcut associated with the element
	 * @param {Boolean} show_parent - Whether to show the dropdown button if dropdown item is added
	 */
	add_dropdown_item({
		label,
		click,
		standard,
		parent,
		shortcut,
		show_parent = true,
		icon = null,
	}) {
		if (show_parent) {
			parent.parent().removeClass("hide hidden-xl");
		}

		let $link = this.is_in_group_button_dropdown(parent, "li > a.grey-link > span", label);
		if ($link) return $link;

		let $li;
		let $icon = ``;

		if (icon) {
			$icon = `<span class="menu-item-icon">${frappe.utils.icon(icon)}</span>`;
		}

		if (shortcut) {
			let shortcut_obj = this.prepare_shortcut_obj(shortcut, click, label);
			$li = $(`
				<li>
					<a class="grey-link dropdown-item" href="#" onClick="return false;">
						${$icon}
						<span class="menu-item-label">${label}</span>
						<kbd class="pull-right">
							<span>${shortcut_obj.shortcut_label}</span>
						</kbd>
					</a>
				</li>
			`);
			frappe.ui.keys.add_shortcut(shortcut_obj);
		} else {
			$li = $(`
				<li>
					<a class="grey-link dropdown-item" href="#" onClick="return false;">
						${$icon}
						<span class="menu-item-label">${label}</span>
					</a>
				</li>
			`);
		}

		$link = $li.find("a").on("click", (e) => {
			if (e.ctrlKey || e.metaKey) {
				frappe.open_in_new_tab = true;
			}
			return click();
		});

		if (standard) {
			$li.appendTo(parent);
		} else {
			this.divider = parent.find(".dropdown-divider");
			if (!this.divider.length) {
				this.divider = $('<li class="dropdown-divider user-action"></li>').prependTo(
					parent
				);
			}
			$li.addClass("user-action").insertBefore(this.divider);
		}

		// alt shortcut
		frappe.ui.keys
			.get_shortcut_group(parent.get(0))
			.add($link, $link.find(".menu-item-label"));

		return $link;
	}

	prepare_shortcut_obj(shortcut, click, label) {
		let shortcut_obj;
		// convert to object, if shortcut string passed
		if (typeof shortcut === "string") {
			shortcut_obj = { shortcut };
		} else {
			shortcut_obj = shortcut;
		}
		// label
		if (frappe.utils.is_mac()) {
			shortcut_obj.shortcut_label = shortcut_obj.shortcut.replace("Ctrl", "⌘");
		} else {
			shortcut_obj.shortcut_label = shortcut_obj.shortcut;
		}
		// actual shortcut string
		shortcut_obj.shortcut = shortcut_obj.shortcut.toLowerCase();
		// action is button click
		if (!shortcut_obj.action) {
			shortcut_obj.action = click;
		}
		// shortcut description can be button label
		if (!shortcut_obj.description) {
			shortcut_obj.description = label;
		}
		// page
		shortcut_obj.page = this;
		return shortcut_obj;
	}

	/*
	 * Check if there already exists a button with a specified label in a specified button group
	 * @param {object} parent - This should be the `ul` of the button group.
	 * @param {string} selector - CSS Selector of the button to be searched for. By default, it is `li`.
	 * @param {string} label - Label of the button
	 */
	is_in_group_button_dropdown(parent, selector, label) {
		if (!selector) selector = "li";

		if (!label || !parent) return false;

		const item_selector = `${selector}[data-label="${encodeURIComponent(label)}"]`;

		const existing_items = $(parent).find(item_selector);
		return existing_items?.length > 0 && existing_items;
	}

	clear_btn_group(parent) {
		parent.empty();
		parent.parent().addClass("hide");
	}

	add_divider() {
		return $('<li class="dropdown-divider"></li>').appendTo(this.menu);
	}

	get_or_add_inner_group_button(label) {
		var $group = this.inner_toolbar.find(
			`.inner-group-button[data-label="${encodeURIComponent(label)}"]`
		);
		if (!$group.length) {
			$group = $(
				`<div class="inner-group-button" data-label="${encodeURIComponent(label)}">
					<button type="button" class="btn btn-default ellipsis" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
						${label}
						${frappe.utils.icon("select", "xs")}
					</button>
					<div role="menu" class="dropdown-menu"></div>
				</div>`
			).appendTo(this.inner_toolbar);
		}
		return $group;
	}

	get_inner_group_button(label) {
		return this.inner_toolbar.find(
			`.inner-group-button[data-label="${encodeURIComponent(label)}"]`
		);
	}

	set_inner_btn_group_as_primary(label) {
		this.get_or_add_inner_group_button(label)
			.find("button")
			.removeClass("btn-default")
			.addClass("btn-primary");
	}

	btn_disable_enable(btn, response) {
		if (response && response.then) {
			btn.prop("disabled", true);
			response.then(() => {
				btn.prop("disabled", false);
			});
		} else if (response && response.always) {
			btn.prop("disabled", true);
			response.always(() => {
				btn.prop("disabled", false);
			});
		}
	}

	/*
	 * Add button to button group. If there exists another button with the same label,
	 * `add_inner_button` will not add the new button to the button group even if the callback
	 * function is different.
	 *
	 * @param {string} label - Label of the button to be added to the group
	 * @param {object} action - function to be called when button is clicked
	 * @param {string} group - Label of the group button
	 */
	add_inner_button(label, action, group, type = "default") {
		var me = this;
		let _action = function () {
			let btn = $(this);
			let response = action();
			me.btn_disable_enable(btn, response);
		};
		// Add actions as menu item in Mobile View
		let menu_item_label = group ? `${group} > ${label}` : label;
		let menu_item = this.add_menu_item(menu_item_label, _action, false, false, false);
		menu_item.parent().addClass("hidden-xl");
		if (this.menu_btn_group.hasClass("hide")) {
			this.menu_btn_group.removeClass("hide").addClass("hidden-xl");
		}

		if (group) {
			var $group = this.get_or_add_inner_group_button(group);
			$(this.inner_toolbar).removeClass("hide");

			if (!this.is_in_group_button_dropdown($group.find(".dropdown-menu"), "a", label)) {
				return $(
					`<a class="dropdown-item" href="#" onclick="return false;" data-label="${encodeURIComponent(
						label
					)}">${label}</a>`
				)
					.on("click", _action)
					.appendTo($group.find(".dropdown-menu"));
			}
		} else {
			let button = this.inner_toolbar.find(
				`button[data-label="${encodeURIComponent(label)}"]`
			);
			if (button.length == 0) {
				button = $(`<button data-label="${encodeURIComponent(
					label
				)}" class="btn btn-${type} ellipsis">
					${__(label)}
				</button>`);
				button.on("click", _action);
				button.appendTo(this.inner_toolbar.removeClass("hide"));
			}
			return button;
		}
	}

	remove_inner_button(label, group) {
		if (typeof label === "string") {
			label = [label];
		}
		// translate
		label = label.map((l) => __(l));

		if (group) {
			var $group = this.get_inner_group_button(__(group));
			if ($group.length) {
				$group.find(`.dropdown-item[data-label="${encodeURIComponent(label)}"]`).remove();
			}
			if ($group.find(".dropdown-item").length === 0) $group.remove();
		} else {
			this.inner_toolbar.find(`button[data-label="${encodeURIComponent(label)}"]`).remove();
		}
	}

	change_inner_button_type(label, group, type) {
		let btn;

		if (group) {
			var $group = this.get_inner_group_button(__(group));
			if ($group.length) {
				btn = $group.find(`.dropdown-item[data-label="${encodeURIComponent(label)}"]`);
			}
		} else {
			btn = this.inner_toolbar.find(`button[data-label="${encodeURIComponent(label)}"]`);
		}

		if (btn) {
			btn.removeClass().addClass(`btn btn-${type} ellipsis`);
		}
	}

	add_inner_message(message) {
		let $message = $(`<span class='inner-page-message text-muted small'>${message}</div>`);
		this.inner_toolbar.find(".inner-page-message").remove();
		this.inner_toolbar.removeClass("hide").prepend($message);

		return $message;
	}

	clear_inner_toolbar() {
		this.inner_toolbar.empty().addClass("hide");
	}

	//-- Sidebar --//

	add_sidebar_item(label, action, insert_after, prepend) {
		var parent = this.sidebar.find(".sidebar-menu.standard-actions");
		var li = $("<li>");
		var link = $("<a>").html(label).on("click", action).appendTo(li);

		if (insert_after) {
			li.insertAfter(parent.find(insert_after));
		} else {
			if (prepend) {
				li.prependTo(parent);
			} else {
				li.appendTo(parent);
			}
		}
		return link;
	}

	//---//

	clear_user_actions() {
		this.menu.find(".user-action").remove();
	}

	// page::title
	get_title_area() {
		return this.$title_area;
	}

	set_title(title, icon = null, strip = true, tab_title = "") {
		if (!title) title = "";
		if (strip) {
			title = strip_html(title);
		}
		this.title = title;
		frappe.utils.set_title(tab_title || title);
		if (icon) {
			title = `${frappe.utils.icon(icon)} ${title}`;
		}
		let title_wrapper = this.$title_area.find(".title-text");
		title_wrapper.html(title);
		title_wrapper.attr("title", this.title);
	}

	set_title_sub(txt) {
		// strip icon
		this.$sub_title_area.html(txt).toggleClass("hide", !!!txt);
	}

	get_main_icon(icon) {
		return this.$title_area
			.find(".title-icon")
			.html('<i class="' + icon + ' fa-fw"></i> ')
			.toggle(true);
	}

	add_help_button(txt) {
		//
	}

	add_button(label, click, opts) {
		if (!opts) opts = {};
		let button = $(`<button
			class="btn ${opts.btn_class || "btn-default"} ${opts.btn_size || "btn-sm"} ellipsis">
				${opts.icon ? frappe.utils.icon(opts.icon) : ""}
				${label}
		</button>`);
		// Add actions as menu item in Mobile View (similar to "add_custom_button" in forms.js)
		let menu_item = this.add_menu_item(label, click, false);
		menu_item.parent().addClass("hidden-xl");

		button.appendTo(this.custom_actions);
		button.on("click", click);
		this.custom_actions.removeClass("hide");

		return button;
	}

	add_custom_button_group(label, icon, parent) {
		let dropdown_label = `<span class="hidden-xs">
			<span class="custom-btn-group-label">${__(label)}</span>
			${frappe.utils.icon("select", "xs")}
		</span>`;

		if (icon) {
			dropdown_label = `<span class="hidden-xs">
				${frappe.utils.icon(icon)}
				<span class="custom-btn-group-label">${__(label)}</span>
				${frappe.utils.icon("select", "xs")}
			</span>
			<span class="visible-xs">
				${frappe.utils.icon(icon)}
			</span>`;
		}

		let custom_btn_group = $(`
			<div class="custom-btn-group">
				<button type="button" class="btn btn-default btn-sm ellipsis" data-toggle="dropdown" aria-expanded="false">
					${dropdown_label}
				</button>
				<ul class="dropdown-menu" role="menu"></ul>
			</div>
		`);

		if (!parent) parent = this.custom_actions;
		parent.removeClass("hide").append(custom_btn_group);

		return custom_btn_group.find(".dropdown-menu");
	}

	add_dropdown_button(parent, label, click, icon) {
		frappe.ui.toolbar.add_dropdown_button(parent, label, click, icon);
	}

	// page::form
	add_label(label) {
		this.show_form();
		return $("<label class='col-md-1 page-only-label'>" + label + " </label>").appendTo(
			this.page_form
		);
	}
	add_select(label, options) {
		var field = this.add_field({ label: label, fieldtype: "Select" });
		return field.$wrapper.find("select").empty().add_options(options);
	}
	add_data(label) {
		var field = this.add_field({ label: label, fieldtype: "Data" });
		return field.$wrapper.find("input").attr("placeholder", label);
	}
	add_date(label, date) {
		var field = this.add_field({ label: label, fieldtype: "Date", default: date });
		return field.$wrapper.find("input").attr("placeholder", label);
	}
	add_check(label) {
		return $("<div class='checkbox'><label><input type='checkbox'>" + label + "</label></div>")
			.appendTo(this.page_form)
			.find("input");
	}
	add_break() {
		// add further fields in the next line
		this.page_form.append('<div class="clearfix invisible-xs"></div>');
	}
	add_field(df, parent) {
		this.show_form();

		if (!df.placeholder) {
			df.placeholder = df.label;
		}

		df.input_class = "input-xs";

		var f = frappe.ui.form.make_control({
			df: df,
			parent: parent || this.page_form,
			only_input: df.fieldtype == "Check" ? false : true,
		});
		f.refresh();
		$(f.wrapper)
			.addClass("col-md-2")
			.attr("title", __(df.label))
			.tooltip({
				delay: { show: 600, hide: 100 },
				trigger: "hover",
			});

		// html fields in toolbar are only for display
		if (df.fieldtype == "HTML") {
			return;
		}

		// hidden fields dont have $input
		if (!f.$input) f.make_input();

		f.$input.attr("placeholder", __(df.label));

		if (df.fieldtype === "Check") {
			$(f.wrapper).find(":first-child").removeClass("col-md-offset-4 col-md-8");
		}

		if (df.fieldtype == "Button") {
			$(f.wrapper).find(".page-control-label").html("&nbsp;");
			f.$input.addClass("btn-xs").css({ width: "100%", "margin-top": "-1px" });
		}

		if (df["default"]) f.set_input(df["default"]);
		this.fields_dict[df.fieldname || df.label] = f;
		return f;
	}
	clear_fields() {
		this.page_form.empty();
	}
	show_form() {
		this.page_form.removeClass("hide");
	}
	hide_form() {
		this.page_form.addClass("hide");
	}
	get_form_values() {
		var values = {};
		for (let fieldname in this.fields_dict) {
			let field = this.fields_dict[fieldname];
			values[fieldname] = field.get_value();
		}
		return values;
	}
	add_view(name, html) {
		let element = html;
		if (typeof html === "string") {
			element = $(html);
		}
		this.views[name] = element.appendTo($(this.wrapper).find(".page-content"));
		if (!this.current_view) {
			this.current_view = this.views[name];
		} else {
			this.views[name].toggle(false);
		}
		return this.views[name];
	}
	set_view(name) {
		if (this.current_view_name === name) return;
		this.current_view && this.current_view.toggle(false);
		this.current_view = this.views[name];

		this.previous_view_name = this.current_view_name;
		this.current_view_name = name;

		this.views[name].toggle(true);

		this.wrapper.trigger("view-change");
	}
};
