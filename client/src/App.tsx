import React from 'react'
import './App.css'
import HomePage from './components/HomePage/HomePage'
import './amplify'

function App(): React.JSX.Element {
  return (
    <div className="App">
      <HomePage />
    </div>
  )
}

export default App 