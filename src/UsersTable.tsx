import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type InputHTMLAttributes,
} from 'react'
import {
  useReactTable,
  getCoreRowModel, // builds the basic rows from your data
  getSortedRowModel, // adds client-side sorting on top of the core rows
  getFilteredRowModel, // adds client-side filtering (used by the global search box)
  getPaginationRowModel, // slices the rows into pages (used by the pagination controls)
  flexRender, // renders a column's header/cell, whether it's a string or a JSX function
  createColumnHelper, // small helper that gives column definitions type-safety + autocomplete
  type SortingState, // type of the sorting state we hold in React
  type ColumnFiltersState, // type of the per-column filter state we hold in React
  type RowSelectionState, // type of the row-selection state (a map of selected row ids)
  type VisibilityState, // type of the column-visibility state (a map of hidden columns)
  type RowData, // generic constraint used by the meta augmentation below
} from '@tanstack/react-table'

// Module augmentation: teach TanStack Table about the custom `meta` we attach to
// columns. Without this, `columnDef.meta.filterVariant` would be a type error.
declare module '@tanstack/react-table' {
  interface ColumnMeta<TData extends RowData, TValue> {
    filterVariant?: 'select'
    filterOptions?: string[]
  }
}

// One row in our table — the shape every column reads from.
type User = {
  id: number
  name: string
  email: string
  age: number
  status: 'active' | 'inactive'
}

// The raw shape DummyJSON returns (only the fields we `select`).
type ApiUser = {
  id: number
  firstName: string
  lastName: string
  email: string
  age: number
}

// The free API we pull real users from.
// DummyJSON returns real-looking users with id, firstName, lastName, email and age.
// We only ask for the fields we need (`select`) and the first 50 rows (`limit`) so the
// pagination controls below have several pages to actually flip through.
const API_URL =
  'https://dummyjson.com/users?limit=50&select=firstName,lastName,email,age'

// `createColumnHelper<User>()` is keyed to our row type, so each accessor key is
// checked against User and each cell's `getValue()` is correctly typed.
const columnHelper = createColumnHelper<User>()

// A checkbox that can also show the "indeterminate" dash (used by the header
// checkbox when only SOME rows are selected). HTML exposes `indeterminate` only
// as a JS property, not an attribute, so we set it on the DOM node via a ref
// after each render.
function IndeterminateCheckbox({
  indeterminate,
  className = '',
  ...rest
}: { indeterminate?: boolean } & InputHTMLAttributes<HTMLInputElement>) {
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (ref.current && typeof indeterminate === 'boolean') {
      // Show the dash only when it's indeterminate AND not fully checked.
      ref.current.indeterminate = !rest.checked && indeterminate
    }
  }, [indeterminate, rest.checked])

  return (
    <input
      type="checkbox"
      ref={ref}
      className={'h-4 w-4 cursor-pointer accent-signal ' + className}
      {...rest}
    />
  )
}

// --- Column definitions -----------------------------------------------------
// Each `columnHelper.accessor(field, { ... })` describes one column:
//   - the first arg is which property of the row to read
//   - `header` is what shows in the <th>
//   - `cell` (optional) customizes how the value is rendered in each <td>
const columns = [
  // Selection column — a `display` column has no accessor, so it isn't sortable
  // or filterable; it just renders checkboxes.
  columnHelper.display({
    id: 'select',
    enableHiding: false, // always keep the selection column visible (hide it from the Columns menu)
    // Header checkbox toggles all rows ON THE CURRENT PAGE only (the *Page*
    // variants). It shows the dash when only some of this page's rows are selected.
    header: ({ table }) => (
      <IndeterminateCheckbox
        checked={table.getIsAllPageRowsSelected()}
        indeterminate={table.getIsSomePageRowsSelected()}
        onChange={table.getToggleAllPageRowsSelectedHandler()}
        aria-label="Select all rows on this page"
      />
    ),
    // Per-row checkbox toggles just that row.
    cell: ({ row }) => (
      <IndeterminateCheckbox
        checked={row.getIsSelected()}
        disabled={!row.getCanSelect()}
        onChange={row.getToggleSelectedHandler()}
        aria-label={`Select ${row.original.name}`}
      />
    ),
  }),
  columnHelper.accessor('id', {
    header: 'ID',
    // Numeric columns default to the `inNumberRange` filter (expects a [min, max]
    // tuple), so our single text box wouldn't filter. equalsString compares the
    // whole value, so typing "3" matches ONLY ID 3 (exact match, not 13/23/…).
    filterFn: 'equalsString',
  }),
  columnHelper.accessor('name', {
    header: 'Name',
  }),
  columnHelper.accessor('email', {
    header: 'Email',
  }),
  columnHelper.accessor('age', {
    header: 'Age',
    // Same as ID: exact match on this numeric column, so typing "29" matches
    // ONLY age 29 (not 129, etc.).
    filterFn: 'equalsString',
  }),
  columnHelper.accessor('status', {
    header: 'Status',
    // Status has only two values, so its filter is a dropdown (see the header).
    // `meta` is free-form per-column data; we use it to tell the header which
    // filter UI to render and which options to offer.
    meta: { filterVariant: 'select', filterOptions: ['active', 'inactive'] },
    // EXACT match, not substring: "active" is a substring of "inactive", so a
    // substring filter would match both. equalsString compares the whole value.
    filterFn: 'equalsString',
    // The signature element: render status as a presence "signal" — a lit amber
    // dot for active, a hollow ring for inactive (never color-only: label too).
    cell: (info) => {
      const isActive = info.getValue() === 'active'
      return (
        <span className="inline-flex items-center gap-2">
          <span
            aria-hidden="true"
            className={
              'h-2 w-2 shrink-0 rounded-full ' +
              (isActive
                ? 'bg-signal shadow-[0_0_0_3px_rgba(224,146,42,0.18)]'
                : 'border border-muted/60')
            }
          />
          <span className={isActive ? 'text-ink' : 'text-muted'}>
            {isActive ? 'Active' : 'Inactive'}
          </span>
        </span>
      )
    },
  }),
]

export default function UsersTable() {
  // `data` holds the users fetched from the API; `loading`/`error` track the fetch lifecycle.
  const [data, setData] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // `sorting` is TanStack Table's sort state: an array like [{ id: 'name', desc: false }].
  // We own this state so the table stays a "controlled" component.
  const [sorting, setSorting] = useState<SortingState>([])

  // `globalFilter` is the text typed into the search box. TanStack Table matches it
  // against EVERY column at once (case-insensitive "contains") to decide which rows show.
  const [globalFilter, setGlobalFilter] = useState('')

  // `columnFilters` is the PER-COLUMN search state: an array like
  // [{ id: 'name', value: 'em' }]. Each entry filters only its own column.
  // Column filters and the global filter are combined with AND — a row must pass both.
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])

  // `rowSelection` maps selected row ids to true, e.g. { '3': true, '7': true }.
  // It persists across pages and filters (selection is tracked by row id).
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})

  // `columnVisibility` maps a column id to false when it's HIDDEN, e.g. { email: false }.
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  // Whether the "Columns" dropdown is open, plus a ref so we can close it on
  // an outside click.
  const [columnsOpen, setColumnsOpen] = useState(false)
  const columnsMenuRef = useRef<HTMLDivElement>(null)

  // Fetch the real users once when the component first mounts.
  useEffect(() => {
    // An AbortController lets us cancel the request if the component unmounts mid-flight.
    const controller = new AbortController()

    async function fetchUsers() {
      try {
        const res = await fetch(API_URL, { signal: controller.signal })
        if (!res.ok) throw new Error(`Request failed: ${res.status}`)
        const json = (await res.json()) as { users: ApiUser[] }

        // Reshape the API response into the exact row shape our columns expect.
        const rows = json.users.map(
          (u): User => ({
            id: u.id,
            name: `${u.firstName} ${u.lastName}`,
            email: u.email,
            age: u.age,
            // NOTE: DummyJSON has no active/inactive flag, so we ASSIGN one at
            // random (~50/50) here. This runs once when the data loads, so each
            // user keeps a stable status for the session. Swap this for your
            // backend's real value.
            status: Math.random() < 0.5 ? 'active' : 'inactive',
          })
        )

        setData(rows)
      } catch (err) {
        // A cancelled request throws AbortError — that's expected, so we ignore it.
        if (err instanceof Error && err.name !== 'AbortError') setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    fetchUsers()
    return () => controller.abort() // cleanup on unmount
  }, [])

  // Close the "Columns" dropdown when you click outside it or press Escape.
  useEffect(() => {
    if (!columnsOpen) return
    function onPointerDown(e: MouseEvent) {
      if (
        columnsMenuRef.current &&
        !columnsMenuRef.current.contains(e.target as Node)
      ) {
        setColumnsOpen(false)
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setColumnsOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [columnsOpen])

  // `useMemo` keeps the same array reference between renders so the table doesn't
  // rebuild needlessly. (columns is defined at module scope, so it's already stable.)
  const tableData = useMemo(() => data, [data])

  // The core hook: hand it data + columns + the row models you want, and it returns
  // a `table` instance with all the helpers to render headers, rows and cells.
  const table = useReactTable({
    data: tableData,
    columns,
    state: { sorting, globalFilter, columnFilters, rowSelection, columnVisibility }, // sort + search + filters + selection + visibility
    onSortingChange: (updater) => {
      setSorting(updater) // apply the new sort
      // Sorting reorders the rows (so the page now shows a different set), which
      // would leave a confusing selection — clear all selected rows on every sort.
      setRowSelection({})
    },
    onGlobalFilterChange: setGlobalFilter, // let the table update search state as we type
    onColumnFiltersChange: setColumnFilters, // let the table update per-column filter state
    onRowSelectionChange: setRowSelection, // let the table update which rows are selected
    onColumnVisibilityChange: setColumnVisibility, // let the table update which columns are visible
    enableRowSelection: true, // turn on checkbox row selection
    // The table manages pagination state internally; we just seed the starting page size.
    initialState: { pagination: { pageSize: 10 } },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(), // enables click-to-sort
    getFilteredRowModel: getFilteredRowModel(), // enables the global search filter
    getPaginationRowModel: getPaginationRowModel(), // enables pagination (page size set above / via the selector)
  })

  // Live roster tally for the masthead (the "hero" of this design).
  const activeCount = data.filter((u) => u.status === 'active').length
  // How many rows are checked right now (across all pages).
  const selectedCount = Object.keys(rowSelection).length
  // Pagination readout for the transport bar (zero-padded like a counter).
  const pageIndex = table.getState().pagination.pageIndex
  const pageCount = table.getPageCount()

  return (
    <div>
      {/* --- Masthead: eyebrow, title, live tally, and the command search --- */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <header>
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted">
            Directory
          </p>
          <h1 className="font-display text-4xl font-bold tracking-tight text-ink">
            Users
          </h1>
          {/* The hero readout: how many of the roster are active right now. */}
          {!loading && !error && (
            <p className="mt-1 font-mono text-[13px] text-muted">
              <span className="text-signal">{activeCount}</span> / {data.length}{' '}
              active
            </p>
          )}
        </header>

        {/* Global search — the "command" input. Amber underline focus, mono text. */}
        <div className="relative w-full sm:w-72">
          <svg
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          >
            <circle cx="9" cy="9" r="6" />
            <path d="m14 14 4 4" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder="Search the roster…"
            className="block w-full rounded-[4px] border border-line bg-white py-2.5 pl-9 pr-3 font-mono text-sm text-ink placeholder:text-muted/70 focus:border-signal focus:outline-none focus:ring-1 focus:ring-signal/30"
          />
        </div>
      </div>

      {/* Controls row above the table: selection readout + Columns dropdown. */}
      {!loading && !error && (
        <div className="mb-3 flex items-center justify-between">
          {/* Selection readout — how many rows are checked right now. */}
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted">
            <span className="text-signal">{selectedCount}</span>{' '}
            {selectedCount === 1 ? 'row' : 'rows'} selected
          </p>

          {/* Columns dropdown: a button that toggles a popover of checkboxes,
              one per hideable column. `ref` lets the outside-click effect above
              know whether a click landed inside the menu. */}
          <div className="relative" ref={columnsMenuRef}>
            <button
              type="button"
              onClick={() => setColumnsOpen((open) => !open)}
              aria-expanded={columnsOpen}
              className="flex cursor-pointer items-center gap-1.5 rounded-[4px] border border-line bg-white px-3 py-1.5 font-mono text-xs uppercase tracking-[0.14em] text-muted hover:text-ink"
            >
              Columns
              <span className="text-[8px]">▾</span>
            </button>

            {columnsOpen && (
              <div className="absolute right-0 z-10 mt-2 w-44 rounded-[4px] border border-line bg-white p-1.5 shadow-lg">
                {/* getAllLeafColumns() lists every column; getCanHide() is false for
                    the selection column (enableHiding: false), so it's skipped. */}
                {table
                  .getAllLeafColumns()
                  .filter((column) => column.getCanHide())
                  .map((column) => (
                    <label
                      key={column.id}
                      className="flex cursor-pointer items-center gap-2 rounded-[3px] px-2 py-1.5 hover:bg-paper"
                    >
                      {/* checked = visible; the handler flips this column's visibility. */}
                      <input
                        type="checkbox"
                        checked={column.getIsVisible()}
                        onChange={column.getToggleVisibilityHandler()}
                        className="h-4 w-4 cursor-pointer accent-signal"
                      />
                      <span className="text-sm text-ink">
                        {column.columnDef.header as string}
                      </span>
                    </label>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* --- Table area: loading / error / the ledger --- */}
      {loading ? (
        <p className="py-12 text-center font-mono text-sm text-muted">
          Loading roster…
        </p>
      ) : error ? (
        <p className="py-12 text-center font-mono text-sm text-red-700">
          Error: {error}
        </p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                {/* A table can have multiple header rows; here there's just one. */}
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id} className="border-b border-ink/15">
                    {headerGroup.headers.map((header) => {
                      // Is this column currently sorted? Returns 'asc' | 'desc' | false.
                      const sortDir = header.column.getIsSorted()
                      // Numeric columns are right-aligned (tabular figures).
                      const isNum =
                        header.column.id === 'id' || header.column.id === 'age'
                      return (
                        <th key={header.id} className="px-4 py-3 align-top">
                          {/* Sortable columns get a sort-toggle button; the select
                              column (not sortable) renders its checkbox directly.
                              The click handler lives on THIS button (not the whole
                              <th>), so typing in the filter below never sorts. */}
                          {header.column.getCanSort() ? (
                            <button
                              type="button"
                              onClick={header.column.getToggleSortingHandler()}
                              className={
                                'group flex w-full cursor-pointer select-none items-center gap-1 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-muted hover:text-ink ' +
                                (isNum ? 'justify-end' : 'justify-start')
                              }
                            >
                              {flexRender(
                                header.column.columnDef.header,
                                header.getContext()
                              )}
                              {/* Sort indicator: ▲ asc, ▼ desc, or – when the column
                                  is sortable but not currently sorted. The minus is
                                  faint until you hover the header (group-hover). */}
                              <span
                                className={
                                  'text-[9px] leading-none ' +
                                  // Same small size as the carets; the unsorted minus
                                  // is made legible with full color + bold weight
                                  // (rather than a larger size).
                                  (sortDir
                                    ? 'text-signal'
                                    : 'font-bold text-muted group-hover:text-ink')
                                }
                              >
                                {sortDir === 'asc'
                                  ? '▲'
                                  : sortDir === 'desc'
                                    ? '▼'
                                    : '–'}
                              </span>
                            </button>
                          ) : (
                            flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )
                          )}

                          {/* Per-column filter. We pick the UI from meta.filterVariant:
                              a <select> for fixed-option columns (Status), a text
                              <input> for everything else. */}
                          {header.column.getCanFilter() &&
                            (header.column.columnDef.meta?.filterVariant ===
                            'select' ? (
                              <select
                                value={
                                  (header.column.getFilterValue() as string) ??
                                  ''
                                }
                                onChange={(e) =>
                                  // Empty string clears the filter (TanStack auto-removes it).
                                  header.column.setFilterValue(e.target.value)
                                }
                                className="mt-2 block w-full rounded-[3px] border border-line bg-white px-2 py-1 font-mono text-xs text-ink focus:border-signal focus:outline-none focus:ring-1 focus:ring-signal/30"
                              >
                                {/* Empty value = "no filter" = show all rows. */}
                                <option value="">All</option>
                                {(
                                  header.column.columnDef.meta?.filterOptions ??
                                  []
                                ).map((opt) => (
                                  <option key={opt} value={opt}>
                                    {opt.charAt(0).toUpperCase() + opt.slice(1)}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <input
                                type="text"
                                value={
                                  (header.column.getFilterValue() as string) ??
                                  ''
                                }
                                onChange={(e) =>
                                  header.column.setFilterValue(e.target.value)
                                }
                                placeholder="Filter…"
                                className={
                                  'mt-2 block w-full rounded-[3px] border border-line bg-white px-2 py-1 font-mono text-xs text-ink placeholder:text-muted/60 focus:border-signal focus:outline-none focus:ring-1 focus:ring-signal/30 ' +
                                  (isNum ? 'text-right' : '')
                                }
                              />
                            ))}
                        </th>
                      )
                    })}
                  </tr>
                ))}
              </thead>

              <tbody className="divide-y divide-line">
                {table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    className={
                      'hover:bg-white/70 ' +
                      (row.getIsSelected() ? 'bg-signal/5' : '')
                    }
                  >
                    {row.getVisibleCells().map((cell) => {
                      const colId = cell.column.id
                      const isNum = colId === 'id' || colId === 'age'
                      // Per-column typographic treatment: mono data, sans names.
                      const cls =
                        colId === 'name'
                          ? 'font-medium text-ink'
                          : colId === 'email'
                            ? 'font-mono text-[13px] text-muted'
                            : isNum
                              ? 'font-mono tabular-nums text-right text-ink'
                              : 'text-ink'
                      return (
                        <td key={cell.id} className={'px-4 py-3.5 ' + cls}>
                          {/* flexRender handles both plain values and custom cell renderers. */}
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext()
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}

                {/* When the filters hide every row, show a friendly message instead
                    of an empty ledger. `colSpan` spans the cell across all columns. */}
                {table.getRowModel().rows.length === 0 && (
                  <tr>
                    <td
                      colSpan={table.getVisibleLeafColumns().length}
                      className="px-4 py-8 text-center font-mono text-sm text-muted"
                    >
                      No users match your filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* --- Transport bar: rows-per-page + a zero-padded page counter --- */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            {/* Page size selector: changing it calls setPageSize, which re-slices the rows. */}
            <label className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.12em] text-muted">
              Rows
              <select
                value={table.getState().pagination.pageSize}
                onChange={(e) => table.setPageSize(Number(e.target.value))}
                className="cursor-pointer rounded-[3px] border border-line bg-white px-2 py-1 text-ink focus:border-signal focus:outline-none focus:ring-1 focus:ring-signal/30"
              >
                {[5, 10, 20].map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>

            {/* First ‹ PAGE 01 / 05 › Last — the transport cluster. */}
            <div className="flex items-center gap-3">
              {/* setPageIndex(0) jumps straight to the first page. */}
              <button
                onClick={() => table.setPageIndex(0)}
                disabled={!table.getCanPreviousPage()}
                className="cursor-pointer font-mono text-xs uppercase tracking-[0.14em] text-muted hover:text-ink disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:text-muted"
              >
                First
              </button>

              {/* Previous: one page back. Icon-only, so aria-label keeps it accessible. */}
              <button
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
                aria-label="Previous page"
                className="cursor-pointer p-1 text-muted hover:text-signal disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:text-muted"
              >
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M12.79 5.23a.75.75 0 0 1 0 1.06L9.06 10l3.73 3.71a.75.75 0 1 1-1.06 1.06l-4.25-4.24a.75.75 0 0 1 0-1.06l4.25-4.24a.75.75 0 0 1 1.06 0Z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>

              {/* Zero-padded page counter — a deliberate "board" device. */}
              <span className="font-mono text-xs tracking-[0.16em] text-ink">
                PAGE {String(pageIndex + 1).padStart(2, '0')} /{' '}
                {String(pageCount).padStart(2, '0')}
              </span>

              {/* Next: one page forward. */}
              <button
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
                aria-label="Next page"
                className="cursor-pointer p-1 text-muted hover:text-signal disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:text-muted"
              >
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M7.21 14.77a.75.75 0 0 1 0-1.06L10.94 10 7.21 6.29a.75.75 0 1 1 1.06-1.06l4.25 4.24a.75.75 0 0 1 0 1.06l-4.25 4.24a.75.75 0 0 1-1.06 0Z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>

              {/* Last page index is pageCount - 1 (pageIndex is 0-based). */}
              <button
                onClick={() => table.setPageIndex(table.getPageCount() - 1)}
                disabled={!table.getCanNextPage()}
                className="cursor-pointer font-mono text-xs uppercase tracking-[0.14em] text-muted hover:text-ink disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:text-muted"
              >
                Last
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
