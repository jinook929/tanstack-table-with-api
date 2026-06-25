import UsersTable from './UsersTable'

function App() {
  return (
    <main className="mx-auto max-w-4xl p-8">
      <h1 className="mb-1 text-2xl font-bold text-gray-900">Users</h1>
      <p className="mb-6 text-sm text-gray-500">
        Live data from the DummyJSON API — click a column header to sort.
      </p>
      <UsersTable />
    </main>
  )
}

export default App
