import React from 'react'
import './App.css'
import AuthComponent from './components/Auth'
import './amplify'

function App(): React.JSX.Element {
  return (
    <div className="App">
      <AuthComponent />
    </div>
  )
}

export default App 