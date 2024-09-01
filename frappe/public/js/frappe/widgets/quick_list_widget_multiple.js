import ListSettings from "../../../../../../../sites/assets/frappe/js/frappe/list/list_settings.js";
import Widget from "./base_widget.js";

frappe.provide("frappe.utils");

export default class QuickListWidgetMultiple extends Widget {
	constructor(opts) {
		opts.shadow = true;
		super(opts);
	}

	get_config() {
		return {
			document_type: this.document_type,
			label: this.label,
			quick_list_multiple_filter: this.quick_list_multiple_filter,
		};
	}

	set_actions() {
		if (this.in_customize_mode) return;
		this.setup_tabbed_layout();
		this.setup_tab_events();

		this.setup_fields_list_button().then(() => {
			this.setup_add_new_button();
			this.setup_refresh_list_button();
			this.setup_filter_list_button();
		});
	}

	setup_add_new_button() {
		this.add_new_button = $(
			`<div class="add-new btn btn-xs pull-right"
			title="${__("Add New")}  ${__(this.document_type)}
			">
				${frappe.utils.icon("add", "sm")}
			</div>`
		);

		this.add_new_button.appendTo(this.action_area);
		this.add_new_button.on("click", () => {
			frappe.set_route(
				frappe.utils.generate_route({
					type: "doctype",
					name: this.document_type,
					doc_view: "New",
				})
			);
		});
	}

	setup_refresh_list_button() {
		this.refresh_list = $(
			`<div class="refresh-list btn btn-xs pull-right" title="${__("Refresh List")}">
				${frappe.utils.icon("es-line-reload", "sm")}
			</div>`
		);

		this.refresh_list.appendTo(this.action_area);
		this.refresh_list.on("click", () => {
			this.body.empty();
			this.set_body();
		});
	}

	async setup_fields_list_button() {
		this.fields_list = $(
			`<div class="fields-list btn btn-xs pull-right" title="${__("Add/Update Fields")}">
				${frappe.utils.icon("dashboard", "sm")}
			</div>`
		);

		this.fields_list.appendTo(this.action_area);
		//v2
		this.meta = await frappe.db.get_doc('DocType', this.document_type).then((data) => data);
		await this.get_list_view_settings();
		await this.setup_columns();
		this.body.empty();
		this.set_body();
		this.fields_list.on("click", () => this.show_list_settings());
	}
	//setting up tabs
	setup_tabbed_layout() {
		$(`
			<div class="form-tabs-list">
				<ul class="nav form-tabs" id="form-tabs" role="tablist"></ul>
			</div>
		`).appendTo(this.body);
		this.tab_link_container = this.body.find(".form-tabs");
		this.tabs_content = $(`<div class="form-tab-content tab-content"></div>`).appendTo(
			this.body
		);
		this.setup_events();
	}

	setup_events() {
		let last_scroll = 0;
		let tabs_list = $(".form-tabs-list");
		let tabs_content = this.tabs_content[0];
		if (!tabs_list.length) return;

		$(window).scroll(
			frappe.utils.throttle(() => {
				let current_scroll = document.documentElement.scrollTop;
				if (current_scroll > 0 && last_scroll <= current_scroll) {
					tabs_list.removeClass("form-tabs-sticky-down");
					tabs_list.addClass("form-tabs-sticky-up");
				} else {
					tabs_list.removeClass("form-tabs-sticky-up");
					tabs_list.addClass("form-tabs-sticky-down");
				}
				last_scroll = current_scroll;
			}, 500)
		);

		this.tab_link_container.off("click").on("click", ".nav-link", (e) => {
			e.preventDefault();
			e.stopImmediatePropagation();
			$(e.currentTarget).tab("show");
			if (tabs_content.getBoundingClientRect().top < 100) {
				tabs_content.scrollIntoView();
				setTimeout(() => {
					$(".page-head").css("top", "-15px");
					$(".form-tabs-list").removeClass("form-tabs-sticky-down");
					$(".form-tabs-list").addClass("form-tabs-sticky-up");
				}, 3);
			}
		});
	}

	setup_tab_events() {
		this.wrapper.on("keydown", (ev) => {
			if (ev.which == 9) {
				let current = $(ev.target);
				let doctype = current.attr("data-doctype");
				let fieldname = current.attr("data-fieldname");
				if (doctype) {
					return this.handle_tab(doctype, fieldname, ev.shiftKey);
				}
			}
		});
	}
 //v2

 get_fields_in_list_view() {
	return this.meta.fields.filter((df) => {
		return (
			(frappe.model.is_value_type(df.fieldtype) &&
				df.in_list_view &&
				frappe.perm.has_perm(this.document_type, df.permlevel, "read")) ||
			(df.fieldtype === "Currency" && df.options && !df.options.includes(":")) ||
			df.fieldname === "status"
		);
	});
}

	async setup_columns() {
		// setup columns for list view
		this.columns = [];
		const get_df = frappe.meta.get_docfield.bind(null, this.document_type);
		// 1st column: title_field or name
		if (this.meta?.title_field) {
			this.columns.push({
				type: "Subject",
				df: get_df(this.meta.title_field),
			});
		} else {
			this.columns.push({
				type: "Subject",
				df: {
					label: __("ID"),
					fieldname: "name",
				},
			});
		}
		// this.columns.push({
		// 	type: "Tag",
		// });

		// 2nd column: Status indicator
		if (frappe.has_indicator(this.document_type)) {
			// indicator
			this.columns.push({
				type: "Status",
				df: {
					label: __("Status"),
					fieldname: "status",
				},
			});
		}
		
		const fields_in_list_view = this.get_fields_in_list_view();
		// Add rest from in_list_view docfields
		this.columns = this.columns.concat(
			fields_in_list_view
				.filter((df) => {
					if (frappe.has_indicator(this.document_type) && df.fieldname === "status") {
						return false;
					}
					if (!df.in_list_view) {
						return false;
					}
					return df.fieldname !== this.meta.title_field;
				})
				.map((df) => ({
					type: "Field",
					df,
				}))
		);
		
		if (this.list_view_settings.fields) {
			this.columns = this.reorder_listview_fields();
		}

		// limit max to 8 columns if no total_fields is set in List View Settings
		// Screen with low density no of columns 4
		// Screen with medium density no of columns 6
		// Screen with high density no of columns 8
		let total_fields = 6;

		if (window.innerWidth <= 1366) {
			total_fields = 4;
		} else if (window.innerWidth >= 1920) {
			total_fields = 10;
		}

		this.columns = this.columns.slice(0, this.list_view_settings.total_fields || total_fields);

		if (
			this.meta.title_field &&
			this.meta.title_field !== "name"
		) {
			this.columns.push({
				type: "Field",
				df: {
					label: __("ID"),
					fieldname: "name",
				},
			});
		}
	}

	reorder_listview_fields() {
		let fields_order = [];
		let fields = JSON.parse(this.list_view_settings.fields);

		//title and tags field is fixed
		fields_order.push(this.columns[0]);
		fields_order.push(this.columns[1]);
		this.columns.splice(0, 2);

		for (let fld in fields) {
			for (let col in this.columns) {
				let field = fields[fld];
				let column = this.columns[col];

				if (column.type == "Status" && field.fieldname == "status_field") {
					fields_order.push(column);
					break;
				} else if (column.type == "Field" && field.fieldname === column.df.fieldname) {
					fields_order.push(column);
					break;
				}
			}
		}

		return fields_order;
	}

	get_list_view_settings() {
		return frappe
			.call("frappe.desk.listview.get_list_settings", {
				doctype: this.document_type,
			})
			.then((doc) => (this.list_view_settings = doc.message || {}));
	}

	refresh_columns(meta, list_view_settings) {
		this.meta = meta;
		this.list_view_settings = list_view_settings;

		this.setup_columns().then(()=>{
			this.body.empty();
			this.set_body();
		});
	}

	get_table_columns(){
		if (this.columns) {
			let columns = this.columns.reduce((acc, col) => {
				if(col.type === "Field" || col.type === "Subject") {
					return [...acc, col.df.fieldname];
				} else {
					return acc;
				}
			}, []);
			console.log("columns", columns);
			return columns;
		} else {
			let fields = ["name"];

			// get name of title field
			if (!this.title_field_name) {
				this.meta = frappe.get_meta(this.document_type);
				let meta = this.meta;
				this.title_field_name = (meta && meta.title_field) || "name";
			}

			if (this.title_field_name && this.title_field_name != "name") {
				fields.push(this.title_field_name);
			}

			// check doctype has status field
			this.has_status_field = frappe.meta.has_field(this.document_type, "status");

			if (this.has_status_field) {
				fields.push("status");
				fields.push("docstatus");

				// add workflow state field if workflow exist & is active
				let workflow_fieldname = frappe.workflow.get_state_fieldname(this.document_type);
				workflow_fieldname && fields.push(workflow_fieldname);
			}

			fields.push("modified");

			return fields;
		}
	}

	setup_filter_list_button() {
		this.filter_list = $(
			`<div class="filter-list btn btn-xs pull-right" title="${__("Add/Update Filter")}">
				${frappe.utils.icon("filter", "sm")}
			</div>`
		);

		this.filter_list.appendTo(this.action_area);
		this.filter_list.on("click", () => this.setup_filter_dialog());
	}

	setup_filter(doctype) {
		if (this.filter_group) {
			this.filter_group.wrapper.empty();
			delete this.filter_group;
		}

		this.filters = frappe.utils.process_filter_expression(this.quick_list_multiple_filter);

		this.filter_group = new frappe.ui.FilterGroup({
			parent: this.dialog.get_field("filter_area").$wrapper,
			doctype: doctype,
			on_change: () => {},
		});

		frappe.model.with_doctype(doctype, () => {
			this.filter_group.add_filters_to_filter_group(this.filters);
			this.dialog.set_df_property("filter_area", "hidden", false);
		});
	}
	show_list_settings() {
		frappe.model.with_doctype(this.document_type, () => {
			new ListSettings({
				listview: this,
				doctype: this.document_type,
				settings: this.list_view_settings,
				meta: frappe.get_meta(this.document_type),
			});
		});
	}

	setup_filter_dialog() {
		let fields = [
			{
				fieldtype: "HTML",
				fieldname: "filter_area",
			},
		];
		let me = this;
		this.dialog = new frappe.ui.Dialog({
			title: __("Set Filters for {0}", [__(this.document_type)]),
			fields: fields,
			primary_action: function () {
				let old_filter = me.quick_list_multiple_filter;
				let filters = me.filter_group.get_filters();
				me.quick_list_multiple_filter = JSON.stringify(filters);

				this.hide();

				if (old_filter != me.quick_list_multiple_filter) {
					me.body.empty();
					me.set_footer();
					me.set_body();
				}
			},
			primary_action_label: __("Save"),
		});

		this.dialog.show();
		this.setup_filter(this.document_type);
	}

	render_loading_state() {
		this.body.empty();
		this.loading = $(`<div class="list-loading-state text-muted">${__("Loading...")}</div>`);
		this.loading.appendTo(this.body);
	}

	render_no_data_state() {
		this.loading = $(`<div class="list-no-data-state text-muted">${__("No Data...")}</div>`);
		this.loading.appendTo(this.body);
	}

	setup_quick_list_multiple_item(doc) { 
		let $quick_list_multiple_item = $(`
			<tr class="quick-list-multiple-item">
				${Object.keys(doc).map((field) => {
					return `
					<td>
						${doc[field]}
					</td>`
				})}
				<td>
					<div class="right-arrow">${frappe.utils.icon("right", "xs")}</div>
				</td>
			</tr>
		`);

		// $(`<div class="right-arrow">${frappe.utils.icon("right", "xs")}</div>`).appendTo(
		// 	$quick_list_multiple_item
		// );

		$quick_list_multiple_item.click((e) => {
			if (e.ctrlKey || e.metaKey) {
				frappe.open_in_new_tab = true;
			}
			frappe.set_route(`${frappe.utils.get_form_link(this.document_type, doc.name)}`);
		});

		return $quick_list_multiple_item;
	}

	set_body() {
		this.widget.addClass("quick-list-multiple-widget-box");

		this.render_loading_state();

		frappe.model.with_doctype(this.document_type, () => {
			let quick_list_multiple_filter = frappe.utils.process_filter_expression(this.quick_list_multiple_filter);

			this.field_keys = this.get_table_columns()

			let args = {
				method: "frappe.desk.reportview.get",
				args: {
					doctype: this.document_type,
					fields: this.field_keys,
					filters: quick_list_multiple_filter,
					order_by: "modified desc",
					start: 0,
					page_length: 4,
				},
			};

			frappe.call(args).then((r) => {
				if (!r.message) return;
				let data = r.message;

				this.body.empty();
				data = !Array.isArray(data) ? frappe.utils.dict(data.keys, data.values) : data;

				if (!data.length) {
					this.render_no_data_state();
					return;
				}

				this.labels = r.message?.keys.map((key) => {
					let column = this.columns.find((col) => col.df.fieldname === key);
					if (column) {
						return column.df.label;
					} else {
						return key.charAt(0).toUpperCase() + key.slice(1);
					}
				})

				this.quick_list_multiple = data.map((doc) => this.setup_quick_list_multiple_item(doc));
				this.quick_list_multiple_table = $(`
				<table>
					<tr class="quick-list-multiple-item">
					${this.labels.map((field) => {
						return `
						<th>${field}</th>
						`
					})}
					<td></td>
					</tr>
				</table>
				`);

				// this.quick_list_multiple.forEach(($quick_list_multiple_item) =>
				// 	$quick_list_multiple_item.appendTo(this.body)
				// );
				this.quick_list_multiple.forEach(($quick_list_multiple_item) =>
					$quick_list_multiple_item.appendTo(this.quick_list_multiple_table)
				);
				this.quick_list_multiple_table = this.quick_list_multiple_table.filter((i, el)=> i != 0);
				this.quick_list_multiple_table.appendTo(this.body);
			});
		});
	}

	set_footer() {
		this.footer.empty();

		let filters = frappe.utils.get_filter_from_json(this.quick_list_multiple_filter);
		let route = frappe.utils.generate_route({ type: "doctype", name: this.document_type });
		this.see_all_button = $(`
			<div class="see-all btn btn-xs">${__("View List")}</div>
		`).appendTo(this.footer);

		this.see_all_button.click((e) => {
			if (e.ctrlKey || e.metaKey) {
				frappe.open_in_new_tab = true;
			}
			if (filters) {
				frappe.route_options = filters;
			}
			frappe.set_route(route);
		});
	}
}
