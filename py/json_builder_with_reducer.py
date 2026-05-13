import tkinter as tk
from tkinter import ttk, filedialog, messagebox
import json
import os
import csv
import pandas as pd  # Required for the processing logic

# ─────────────────────────────────────────────
#  Data store
# ─────────────────────────────────────────────
loaded_files = {}   # filename → list of records
all_records  = []   # each entry: dict with extra key "_source_file"

def refresh_records():
    global all_records
    all_records = []
    for fname, records in loaded_files.items():
        for rec in records:
            r = dict(rec)
            r["_source_file"] = fname
            all_records.append(r)

# ─────────────────────────────────────────────
#  Helper Logic from App 2
# ─────────────────────────────────────────────
def find_column(columns, target):
    target = target.lower()
    for col in columns:
        c = col.lower().replace(" ", "").replace("_", "")
        if target in c:
            return col
    return None

def process_and_export_reduced():
    """Aggregates all loaded records, groups them, and exports a simplified CSV."""
    if not all_records:
        messagebox.showinfo("No Data", "Please load JSON files first.")
        return

    try:
        # Convert all loaded records to a DataFrame
        df = pd.DataFrame(all_records)
        df.columns = [c.strip() for c in df.columns]

        # Auto-detect columns using App 2 logic
        tol_col = find_column(df.columns, "tollbl")
        nom_col = find_column(df.columns, "nominal")
        act_col = find_column(df.columns, "actual")

        if not all([tol_col, nom_col, act_col]):
            messagebox.showerror("Error", f"Required columns (TolLbl, Nominal, Actual) not detected.\nFound: {tol_col}, {nom_col}, {act_col}")
            return

        # Clean and Convert
        df = df[df[tol_col].notna()]
        df[act_col] = pd.to_numeric(df[act_col], errors="coerce")
        # Ensure TolLbl is numeric for range generation
        df[tol_col] = pd.to_numeric(df[tol_col], errors="coerce")
        df = df.dropna(subset=[tol_col])

        # Grouping Logic from App 2
        result = (
            df.groupby(tol_col)
            .agg(
                Nominal=(nom_col, "first"),
                ActualMin=(act_col, "min"),
                ActualMax=(act_col, "max"),
            )
            .reset_index()
            .rename(columns={tol_col: "TolLbl"})
        )

        # Fill missing TolLbl ranges
        max_lbl = int(result["TolLbl"].max())
        full_range = pd.DataFrame({"TolLbl": range(1, max_lbl + 1)})
        result = full_range.merge(result, on="TolLbl", how="left")

        # Save Dialog
        path = filedialog.asksaveasfilename(
            defaultextension=".csv",
            filetypes=[("CSV files", "*.csv")],
            title="Save Reduced Analysis"
        )
        if path:
            result.to_csv(path, index=False)
            messagebox.showinfo("Success", f"Reduced report saved to {os.path.basename(path)}")
            status_var.set(f"Reduced CSV saved: {max_lbl} labels processed.")

    except Exception as e:
        messagebox.showerror("Processing Error", str(e))

# ─────────────────────────────────────────────
#  Checkbox list widget
# ─────────────────────────────────────────────
class CheckList(tk.Frame):
    def __init__(self, parent, bg, fg, accent, **kwargs):
        super().__init__(parent, bg=bg, **kwargs)
        self._bg = bg
        self._fg = fg
        self._accent = accent
        self._vars = []

        border = tk.Frame(self, bg="#3f3f5a", padx=1, pady=1)
        border.pack(fill=tk.BOTH, expand=True)

        self._canvas = tk.Canvas(border, bg=bg, highlightthickness=0)
        self._sb = tk.Scrollbar(border, orient=tk.VERTICAL, command=self._canvas.yview)
        self._canvas.configure(yscrollcommand=self._sb.set)
        self._sb.pack(side=tk.RIGHT, fill=tk.Y)
        self._canvas.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)

        self._inner = tk.Frame(self._canvas, bg=bg)
        self._win = self._canvas.create_window((0, 0), window=self._inner, anchor="nw")
        self._inner.bind("<Configure>", self._on_configure)
        self._canvas.bind("<Configure>", self._on_canvas_resize)
        self._canvas.bind("<MouseWheel>", self._on_mousewheel)

    def _on_configure(self, e):
        self._canvas.configure(scrollregion=self._canvas.bbox("all"))

    def _on_canvas_resize(self, e):
        self._canvas.itemconfig(self._win, width=e.width)

    def _on_mousewheel(self, e):
        self._canvas.yview_scroll(int(-1*(e.delta/120)), "units")

    def clear(self):
        for w in self._inner.winfo_children():
            w.destroy()
        self._vars = []

    def add_header(self, text):
        lbl = tk.Label(
            self._inner, text=text, 
            bg="#2a2a3e", fg="#06b6d4", 
            font=("Consolas", 9, "bold"), 
            pady=6, anchor="w", padx=5
        )
        lbl.pack(fill=tk.X)

    def add_item(self, item_text, is_checked=True):
        var = tk.BooleanVar(value=is_checked)
        cb = tk.Checkbutton(
            self._inner, text=item_text, variable=var,
            bg=self._bg, fg=self._fg,
            selectcolor="#16213e",
            activebackground=self._bg,
            activeforeground=self._fg,
            font=("Consolas", 9),
            anchor="w", padx=15,
            highlightthickness=0, bd=0,
        )
        cb.pack(fill=tk.X, pady=1)
        self._vars.append((item_text, var))

    def populate(self, items):
        checked = {text for text, var in self._vars if var.get()}
        self.clear()
        for item in items:
            self.add_item(item, item in checked)

    def get_checked(self):
        return [text for text, var in self._vars if var.get()]

    def check_all(self):
        for _, var in self._vars:
            var.set(True)

    def uncheck_all(self):
        for _, var in self._vars:
            var.set(False)

# ─────────────────────────────────────────────
#  Helpers
# ─────────────────────────────────────────────
def all_keys():
    desired_order = ['TolLbl', 'TolName', 'Nominal', 'UpperTol', 'LowerTol', 'Actual', 'TolStatus']
    existing_keys = set()
    for r in all_records:
        existing_keys.update(r.keys())
    return [k for k in desired_order if k in existing_keys]

def pretty_feature_label(record):
    parts = []
    keys = label_keys_var.get().split(",")
    for key in keys:
        key = key.strip()
        if key and key in record:
            parts.append("{}".format(record[key]))
    return " | ".join(parts) if parts else str(record)

# ─────────────────────────────────────────────
#  Load / remove files
# ─────────────────────────────────────────────
def load_files():
    paths = filedialog.askopenfilenames(
        title="Select JSON files",
        filetypes=[("JSON files", "*.json"), ("All files", "*.*")]
    )
    for path in paths:
        name = os.path.basename(path)
        try:
            with open(path, encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, list):
                loaded_files[name] = data
            elif isinstance(data, dict):
                loaded_files[name] = [data]
            else:
                messagebox.showwarning("Skipped", "{}: unexpected structure.".format(name))
                continue
        except Exception as e:
            messagebox.showerror("Error", "Could not load {}:\n{}".format(name, e))
            continue

    refresh_records()
    refresh_file_list()
    refresh_feature_checklist()
    refresh_column_checklist()
    status_var.set("{} records loaded from {} file(s).".format(
        len(all_records), len(loaded_files)))

def remove_selected_file():
    sel = file_listbox.curselection()
    if not sel: return
    name = file_listbox.get(sel[0])
    del loaded_files[name]
    refresh_records()
    refresh_file_list()
    refresh_feature_checklist()
    refresh_column_checklist()
    status_var.set("{} records across {} file(s).".format(
        len(all_records), len(loaded_files)))

# ─────────────────────────────────────────────
#  Refresh UI lists
# ─────────────────────────────────────────────
def refresh_file_list():
    file_listbox.delete(0, tk.END)
    for name in loaded_files:
        file_listbox.insert(tk.END, name)

def refresh_feature_checklist():
    feat_checklist.clear()
    for filename, records in loaded_files.items():
        feat_checklist.add_header("--- {} ---".format(filename.upper()))
        for r in records:
            feat_checklist.add_item(pretty_feature_label(r))
    feat_checklist._on_configure(None)

def refresh_column_checklist():
    col_checklist.populate(all_keys())

# ─────────────────────────────────────────────
#  Treeview: sort + drag columns
# ─────────────────────────────────────────────
_sort_reverse = {}
_drag = {"col": None, "start_x": 0}

def build_treeview(cols):
    global report_tree, _sort_reverse, _drag
    for w in tree_frame.winfo_children():
        w.destroy()
    _sort_reverse = {c: False for c in cols}
    _drag = {"col": None, "start_x": 0}

    xsb = ttk.Scrollbar(tree_frame, orient=tk.HORIZONTAL)
    ysb = ttk.Scrollbar(tree_frame, orient=tk.VERTICAL)
    report_tree = ttk.Treeview(tree_frame, columns=cols, show="headings",
                               yscrollcommand=ysb.set, xscrollcommand=xsb.set,
                               selectmode="extended")
    xsb.config(command=report_tree.xview)
    ysb.config(command=report_tree.yview)
    xsb.pack(side=tk.BOTTOM, fill=tk.X)
    ysb.pack(side=tk.RIGHT, fill=tk.Y)
    report_tree.pack(fill=tk.BOTH, expand=True)

    for col in cols:
        report_tree.heading(col, text=col, command=lambda c=col: sort_by_col(c))
        report_tree.column(col, width=120, minwidth=60, stretch=True)

    report_tree.bind("<ButtonPress-1>",   on_drag_start)
    report_tree.bind("<B1-Motion>",       on_drag_motion)
    report_tree.bind("<ButtonRelease-1>", on_drag_release)

def sort_by_col(col):
    data = [(report_tree.set(iid, col), iid) for iid in report_tree.get_children("")]
    rev = _sort_reverse.get(col, False)
    try:
        data.sort(key=lambda x: float(x[0]) if x[0] else 0, reverse=rev)
    except ValueError:
        data.sort(key=lambda x: x[0].lower(), reverse=rev)
    for idx, (_, iid) in enumerate(data):
        report_tree.move(iid, "", idx)
    _sort_reverse[col] = not rev
    for c in report_tree["columns"]:
        arrow = " ▲" if (c == col and not rev) else (" ▼" if (c == col and rev) else "")
        report_tree.heading(c, text=c + arrow, command=lambda cc=c: sort_by_col(cc))

def on_drag_start(event):
    region = report_tree.identify_region(event.x, event.y)
    if region == "heading":
        _drag["col"] = report_tree.identify_column(event.x)
        _drag["start_x"] = event.x

def on_drag_motion(event): pass

def on_drag_release(event):
    if _drag["col"] is None: return
    region = report_tree.identify_region(event.x, event.y)
    if region != "heading":
        _drag["col"] = None
        return
    src = _drag["col"]
    dst = report_tree.identify_column(event.x)
    _drag["col"] = None
    if src == dst: return
    cols     = list(report_tree["columns"])
    src_idx  = int(src[1:]) - 1
    dst_idx  = int(dst[1:]) - 1
    rows     = [tuple(report_tree.set(iid, c) for c in cols)
                for iid in report_tree.get_children("")]
    old_cols = list(cols)
    cols.insert(dst_idx, cols.pop(src_idx))
    build_treeview(cols)
    for row_vals in rows:
        row_dict = dict(zip(old_cols, row_vals))
        report_tree.insert("", tk.END, values=[row_dict.get(c, "") for c in cols])

# ─────────────────────────────────────────────
#  Generate / Export
# ─────────────────────────────────────────────
def generate_report():
    feat_labels = feat_checklist.get_checked()
    if not feat_labels:
        messagebox.showinfo("Select features", "Please check at least one feature.")
        return
    sel_cols = col_checklist.get_checked()
    if not sel_cols:
        messagebox.showinfo("Select columns", "Please check at least one column.")
        return

    label_map = {}
    for r in all_records:
        lbl_text = pretty_feature_label(r)
        if lbl_text not in label_map:
            label_map[lbl_text] = []
        label_map[lbl_text].append(r)

    selected_records = []
    for lbl_text in feat_labels:
        selected_records.extend(label_map.get(lbl_text, []))

    display_cols = ["File"] + sel_cols
    build_treeview(display_cols)
    for rec in selected_records:
        row = [rec.get("_source_file", "")]
        for c in sel_cols:
            row.append(rec.get(c, ""))
        report_tree.insert("", tk.END, values=row)
    status_var.set("Report: {} row(s).".format(len(selected_records)))

def export_csv():
    if report_tree is None or not report_tree.get_children(""):
        messagebox.showinfo("Nothing to export", "Generate a report first.")
        return
    path = filedialog.asksaveasfilename(
        defaultextension=".csv",
        filetypes=[("CSV files", "*.csv"), ("All files", "*.*")],
        title="Save report as CSV"
    )
    if not path: return
    cols = list(report_tree["columns"])
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(cols)
        for iid in report_tree.get_children(""):
            writer.writerow([report_tree.set(iid, c) for c in cols])
    status_var.set("Exported to {}".format(os.path.basename(path)))

# ─────────────────────────────────────────────
#  Build UI
# ─────────────────────────────────────────────
root = tk.Tk()
root.title("JSON Report Builder + Analyzer")
root.geometry("1300x780")
root.configure(bg="#6b6b7d")

label_keys_var = tk.StringVar(value="TolLbl, TolName, Nominal, UpperTol, LowerTol")
report_tree = None

S = {
    "bg":      "#6b6b7d",
    "panel":   "#2a2a3e",
    "accent":  "#7c3aed",
    "accent2": "#06b6d4",
    "fg":      "#e2e8f0",
    "fg_dim":  "#94a3b8",
    "border":  "#3f3f5a",
}

st = ttk.Style()
st.theme_use("clam")
st.configure("TButton", background=S["accent"], foreground="white", font=("Segoe UI", 9, "bold"), relief="flat", padding=6)
st.map("TButton", background=[("active", "#6d28d9")])
st.configure("Cyan.TButton", background=S["accent2"], foreground="#0f172a", font=("Segoe UI", 9, "bold"), relief="flat", padding=6)
st.map("Cyan.TButton", background=[("active", "#0891b2")])
st.configure("Dim.TButton", background=S["border"], foreground=S["fg"], font=("Segoe UI", 8), relief="flat", padding=4)
st.map("Dim.TButton", background=[("active", "#4f4f70")])
st.configure("Treeview", background="#dcdcde", foreground="#1a1a2e", fieldbackground="#dcdcde", rowheight=22, font=("Consolas", 9))
st.configure("Treeview.Heading", background=S["accent"], foreground="white", font=("Segoe UI", 9, "bold"), relief="flat")

def make_lbl(parent, text, size=9, dim=False):
    return tk.Label(parent, text=text, bg=S["panel"], fg=S["fg_dim"] if dim else S["fg"], font=("Segoe UI", size))

def make_file_lb(parent):
    frm = tk.Frame(parent, bg=S["border"], padx=1, pady=1)
    frm.pack(fill=tk.BOTH, expand=True)
    sb = tk.Scrollbar(frm)
    lb = tk.Listbox(frm, height=7, bg="#16213e", fg=S["fg"], selectbackground=S["accent"], selectforeground="white", font=("Consolas", 9), bd=0, highlightthickness=0, yscrollcommand=sb.set)
    sb.config(command=lb.yview); sb.pack(side=tk.RIGHT, fill=tk.Y); lb.pack(fill=tk.BOTH, expand=True)
    return lb

bar = tk.Frame(root, bg=S["accent"], height=40)
bar.pack(fill=tk.X); bar.pack_propagate(False)
tk.Label(bar, text="  JSON Report Builder", bg=S["accent"], fg="white", font=("Segoe UI", 12, "bold")).pack(side=tk.LEFT, pady=8)

body = tk.Frame(root, bg=S["bg"])
body.pack(fill=tk.BOTH, expand=True, padx=10, pady=8)

# Left Panel
left = tk.Frame(body, bg=S["panel"], padx=8, pady=8, width=230)
left.pack(side=tk.LEFT, fill=tk.BOTH, padx=(0,6)); left.pack_propagate(False)
make_lbl(left, "📁  Loaded Files", 10).pack(anchor="w", pady=(0,4))
file_listbox = make_file_lb(left)
ttk.Button(left, text="+ Load JSON files", command=load_files).pack(fill=tk.X, pady=(6,2))
ttk.Button(left, text="✕ Remove selected", style="Dim.TButton", command=remove_selected_file).pack(fill=tk.X, pady=2)
tk.Frame(left, bg=S["border"], height=1).pack(fill=tk.X, pady=8)
make_lbl(left, "Feature label keys:", dim=True).pack(anchor="w")
tk.Entry(left, textvariable=label_keys_var, bg="#16213e", fg=S["fg"], insertbackground=S["fg"], font=("Consolas", 9), relief="flat", bd=4).pack(fill=tk.X, pady=4)
ttk.Button(left, text="↻ Refresh labels", style="Dim.TButton", command=refresh_feature_checklist).pack(fill=tk.X)

# Features Panel
fp = tk.Frame(body, bg=S["panel"], padx=8, pady=8)
fp.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=(0,6))
make_lbl(fp, "📋  Features (grouped by file)", 10).pack(anchor="w", pady=(0,4))
feat_checklist = CheckList(fp, bg=S["bg"], fg=S["fg"], accent=S["accent"])
feat_checklist.pack(fill=tk.BOTH, expand=True)
fr = tk.Frame(fp, bg=S["panel"]); fr.pack(fill=tk.X, pady=(6,0))
ttk.Button(fr, text="☑ All", style="Dim.TButton", command=feat_checklist.check_all).pack(side=tk.LEFT, padx=(0,4))
ttk.Button(fr, text="☐ None", style="Dim.TButton", command=feat_checklist.uncheck_all).pack(side=tk.LEFT)

# Columns Panel
cp = tk.Frame(body, bg=S["panel"], padx=8, pady=8, width=220)
cp.pack(side=tk.LEFT, fill=tk.BOTH, padx=(0,6)); cp.pack_propagate(False)
make_lbl(cp, "🔧  Columns", 10).pack(anchor="w", pady=(0,4))
col_checklist = CheckList(cp, bg=S["bg"], fg=S["fg"], accent=S["accent"])
col_checklist.pack(fill=tk.BOTH, expand=True)
cr = tk.Frame(cp, bg=S["panel"]); cr.pack(fill=tk.X, pady=(6,0))
ttk.Button(cr, text="☑ All", style="Dim.TButton", command=col_checklist.check_all).pack(side=tk.LEFT, padx=(0,4))
ttk.Button(cr, text="☐ None", style="Dim.TButton", command=col_checklist.uncheck_all).pack(side=tk.LEFT)
tk.Frame(cp, bg=S["border"], height=1).pack(fill=tk.X, pady=8)
ttk.Button(cp, text="▶  Generate Report", command=generate_report).pack(fill=tk.X, pady=4)
ttk.Button(cp, text="💾  Export to CSV", style="Cyan.TButton", command=export_csv).pack(fill=tk.X, pady=2)

# --- NEW FUNCTIONALITY FROM APP 2 ---
tk.Frame(cp, bg=S["border"], height=1).pack(fill=tk.X, pady=8)
ttk.Button(cp, text="📉 Process Reduced CSV", style="Dim.TButton", command=process_and_export_reduced).pack(fill=tk.X, pady=2)

# Treeview Panel
rp = tk.Frame(body, bg=S["panel"], padx=8, pady=8)
rp.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
make_lbl(rp, "📊  Report", 10).pack(anchor="w", pady=(0,4))
tree_frame = tk.Frame(rp, bg=S["bg"]); tree_frame.pack(fill=tk.BOTH, expand=True)
tk.Label(tree_frame, text="Generate a report to see results here.", bg=S["bg"], fg=S["fg_dim"]).pack(expand=True)

status_var = tk.StringVar(value="Ready.")
tk.Label(root, textvariable=status_var, bg=S["border"], fg=S["fg_dim"], font=("Segoe UI", 8), anchor="w", padx=8).pack(fill=tk.X, side=tk.BOTTOM)

root.mainloop()