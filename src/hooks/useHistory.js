import { useCallback, useReducer } from 'react'

function reducer(state, action) {
  switch (action.type) {
    case 'commit': {
      const next = typeof action.value === 'function' ? action.value(state.present) : action.value
      if (next === state.present) return state
      return { past: [...state.past.slice(-39), state.present], present: next, future: [] }
    }
    case 'replace': return { ...state, present: action.value }
    case 'checkpoint': return { past: [...state.past.slice(-39), action.before], present: state.present, future: [] }
    case 'undo':
      if (!state.past.length) return state
      return { past: state.past.slice(0, -1), present: state.past.at(-1), future: [state.present, ...state.future] }
    case 'redo':
      if (!state.future.length) return state
      return { past: [...state.past, state.present], present: state.future[0], future: state.future.slice(1) }
    default: return state
  }
}

export function useHistory(initialValue) {
  const [state, dispatch] = useReducer(reducer, { past: [], present: initialValue, future: [] })
  return {
    value: state.present,
    commit: useCallback(value => dispatch({ type: 'commit', value }), []),
    replace: useCallback(value => dispatch({ type: 'replace', value }), []),
    checkpoint: useCallback(before => dispatch({ type: 'checkpoint', before }), []),
    undo: useCallback(() => dispatch({ type: 'undo' }), []),
    redo: useCallback(() => dispatch({ type: 'redo' }), []),
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  }
}
