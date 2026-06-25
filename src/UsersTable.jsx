import { useEffect, useMemo, useState } from 'react'
import {
  useReactTable,
  getCoreRowModel, // builds the basic rows from your data
  getSortedRowModel, // adds client-side sorting on top of the core rows
  getFilteredRowModel, // adds client-side filtering (used by the global search box)
  getPaginationRowModel, // slices the rows into pages (used by the pagination controls)
  flexRender, // renders a column's header/cell, whether it's a string or a JSX function
  createColumnHelper, // small helper that gives column definitions type-safety + autocomplete
} from '@tanstack/react-table'

// The free API we pull real users from.
// DummyJSON returns real-looking users with id, firstName, lastName, email and age.
// We only ask for the fields we need (`select`) and the first 50 rows (`limit`) so the
// pagination controls below have several pages to actually flip through.
const API_URL =
  'https://dummyjson.com/users?limit=50&select=firstName,lastName,email,age'

// `createColumnHelper` is keyed to the shape of ONE row in our table.
// Our row shape (after we massage the API response) is: { id, name, email, age, status }.
const columnHelper = createColumnHelper()

// --- Column definitions -----------------------------------------------------
// Each `columnHelper.accessor(field, { ... })` describes one column:
//   - the first arg is which property of the row to read
//   - `header` is what shows in the <th>
//   - `cell` (optional) customizes how the value is rendered in each <td>
const columns = [
  columnHelper.accessor('id', {
    header: 'ID',
  }),
  columnHelper.accessor('name', {
    header: 'Name',
  }),
  columnHelper.accessor('email', {
    header: 'Email',
  }),
  columnHelper.accessor('age', {
    header: 'Age',
  }),
  columnHelper.accessor('status', {
    header: 'Status',
    // Render the status as a colored "pill" instead of plain text.
    cell: (info) => {
      const status = info.getValue()
      const isActive = status === 'active'
      return (
        <span
          className={
            'inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ' +
            (isActive
              ? 'bg-green-100 text-green-700'
              : 'bg-gray-100 text-gray-600')
          }
        >
          {status}
        </span>
      )
    },
  }),
]

export default function UsersTable() {
  // `data` holds the users fetched from the API; `loading`/`error` track the fetch lifecycle.
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // `sorting` is TanStack Table's sort state: an array like [{ id: 'name', desc: false }].
  // We own this state so the table stays a "controlled" component.
  const [sorting, setSorting] = useState([])

  // `globalFilter` is the text typed into the search box. TanStack Table matches it
  // against EVERY column at once (case-insensitive "contains") to decide which rows show.
  const [globalFilter, setGlobalFilter] = useState('')

  // Fetch the real users once when the component first mounts.
  useEffect(() => {
    // An AbortController lets us cancel the request if the component unmounts mid-flight.
    const controller = new AbortController()

    async function fetchUsers() {
      try {
        const res = await fetch(API_URL, { signal: controller.signal })
        if (!res.ok) throw new Error(`Request failed: ${res.status}`)
        const json = await res.json()

        // Reshape the API response into the exact row shape our columns expect.
        const rows = json.users.map((u) => ({
          id: u.id,
          name: `${u.firstName} ${u.lastName}`,
          email: u.email,
          age: u.age,
          // NOTE: no free user API exposes an active/inactive flag, so we DERIVE it
          // from real data. Here: even IDs are "active", odd IDs are "inactive".
          // Swap this rule for whatever your real backend provides.
          status: u.id % 2 === 0 ? 'active' : 'inactive',
        }))

        setData(rows)
      } catch (err) {
        // A cancelled request throws AbortError — that's expected, so we ignore it.
        if (err.name !== 'AbortError') setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    fetchUsers()
    return () => controller.abort() // cleanup on unmount
  }, [])

  // `useMemo` keeps the same array reference between renders so the table doesn't
  // rebuild needlessly. (columns is defined at module scope, so it's already stable.)
  const tableData = useMemo(() => data, [data])

  // The core hook: hand it data + columns + the row models you want, and it returns
  // a `table` instance with all the helpers to render headers, rows and cells.
  const table = useReactTable({
    data: tableData,
    columns,
    state: { sorting, globalFilter }, // tell the table our current sort + search state
    onSortingChange: setSorting, // let the table update sort state when a header is clicked
    onGlobalFilterChange: setGlobalFilter, // let the table update search state as we type
    // The table manages pagination state internally; we just seed the starting page size.
    initialState: { pagination: { pageSize: 10 } },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(), // enables click-to-sort
    getFilteredRowModel: getFilteredRowModel(), // enables the global search filter
    getPaginationRowModel: getPaginationRowModel(), // enables pagination (page size set above / via the selector)
  })

  // --- Render states ---------------------------------------------------------
  if (loading) return <p className="p-6 text-gray-500">Loading users…</p>
  if (error) return <p className="p-6 text-red-600">Error: {error}</p>

  return (
    <div>
      {/* Global search box: its value is the `globalFilter` state. On every keystroke
          we push the text into the table, which re-filters all columns instantly. */}
      <input
        type="text"
        value={globalFilter}
        onChange={(e) => setGlobalFilter(e.target.value)}
        placeholder="Search all columns…"
        className="mb-3 w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />

      <div className="overflow-x-auto rounded-lg border border-gray-200 shadow-sm">
        <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
        <thead className="bg-gray-50">
          {/* A table can have multiple header rows; here there's just one. */}
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                // Is this column currently sorted? Returns 'asc' | 'desc' | false.
                const sortDir = header.column.getIsSorted()
                return (
                  <th
                    key={header.id}
                    // Clicking the header toggles its sort (none → asc → desc → none).
                    onClick={header.column.getToggleSortingHandler()}
                    className="cursor-pointer select-none px-4 py-3 font-semibold text-gray-700 hover:bg-gray-100"
                  >
                    <span className="inline-flex items-center gap-1">
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                      {/* Little arrow that reflects the current sort direction. */}
                      {sortDir === 'asc' && <span aria-hidden>▲</span>}
                      {sortDir === 'desc' && <span aria-hidden>▼</span>}
                    </span>
                  </th>
                )
              })}
            </tr>
          ))}
        </thead>

        <tbody className="divide-y divide-gray-100 bg-white">
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id} className="hover:bg-gray-50">
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className="px-4 py-3 text-gray-700">
                  {/* flexRender handles both plain values and custom cell renderers. */}
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}

          {/* When the search filters out every row, show a friendly message instead
              of an empty table. `colSpan` makes the cell span all columns. */}
          {table.getRowModel().rows.length === 0 && (
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-6 text-center text-gray-400"
              >
                No users match “{globalFilter}”.
              </td>
            </tr>
          )}
        </tbody>
        </table>
      </div>

      {/* --- Pagination controls -------------------------------------------
          `table.getState().pagination` holds { pageIndex, pageSize }.
          pageIndex is 0-based, so we add 1 when showing it to humans. */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm">
        {/* Page size selector: changing it calls setPageSize, which re-slices the rows. */}
        <label className="flex items-center gap-2 text-gray-600">
          Rows per page:
          <select
            value={table.getState().pagination.pageSize}
            onChange={(e) => table.setPageSize(Number(e.target.value))}
            className="rounded-md border border-gray-300 px-2 py-1"
          >
            {[5, 10, 20].map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>

        {/* One pagination cluster: First ‹ Page X of Y › Last.
            Order is First → Previous(arrow) → indicator → Next(arrow) → Last,
            so the single-step arrows sit just inside the jump-to-end buttons. */}
        <div className="flex items-center gap-2">
          {/* setPageIndex(0) jumps straight to the first page. */}
          <button
            onClick={() => table.setPageIndex(0)}
            disabled={!table.getCanPreviousPage()}
            className="rounded-md border border-gray-300 px-3 py-1 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            First
          </button>

          {/* Previous: one page back. Icon-only, so aria-label keeps it accessible. */}
          <button
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            aria-label="Previous page"
            className="rounded-md border border-gray-300 p-1.5 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {/* Small left-chevron arrow (inline SVG, inherits text color). */}
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

          {/* "Page X of Y" — getPageCount() is the total number of pages. */}
          <span className="text-gray-600">
            {table.getState().pagination.pageIndex + 1} / {' '}
            {table.getPageCount()}
          </span>

          {/* Next: one page forward. */}
          <button
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            aria-label="Next page"
            className="rounded-md border border-gray-300 p-1.5 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {/* Small right-chevron arrow (mirror of the left one). */}
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
            className="rounded-md border border-gray-300 px-3 py-1 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Last
          </button>
        </div>
      </div>
    </div>
  )
}
