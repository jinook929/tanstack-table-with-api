import UsersTable from './UsersTable'

function App() {
  // Thin page shell. The masthead (title + live tally) lives inside UsersTable
  // so it can read the fetched data; here we just center and pad the page.
  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <UsersTable />
    </main>
  )
}

export default App
