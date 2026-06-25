import { useEffect, useMemo, useState } from 'react'
import {
  useReactTable,
  getCoreRowModel, // builds the basic rows from your data
  getSortedRowModel, // adds client-side sorting on top of the core rows
  flexRender, // renders a column's header/cell, whether it's a string or a JSX function
  createColumnHelper, // small helper that gives column definitions type-safety + autocomplete
} from '@tanstack/react-table'

// The free API we pull real users from.
// DummyJSON returns real-looking users with id, firstName, lastName, email and age.
// We only ask for the fields we need (`select`) and just the first 10 rows (`limit`).
const API_URL =
  'https://dummyjson.com/users?limit=10&select=firstName,lastName,email,age'

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
  // `data` holds our 10 users, `loading`/`error` track the fetch lifecycle.
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // `sorting` is TanStack Table's sort state: an array like [{ id: 'name', desc: false }].
  // We own this state so the table stays a "controlled" component.
  const [sorting, setSorting] = useState([])

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
    state: { sorting }, // tell the table our current sort state
    onSortingChange: setSorting, // let the table update that state when a header is clicked
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(), // enables click-to-sort
  })

  // --- Render states ---------------------------------------------------------
  if (loading) return <p className="p-6 text-gray-500">Loading users…</p>
  if (error) return <p className="p-6 text-red-600">Error: {error}</p>

  return (
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
        </tbody>
      </table>
    </div>
  )
}
