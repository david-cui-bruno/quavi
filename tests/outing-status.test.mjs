import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {pathToFileURL} from 'node:url'
import ts from 'typescript'
import React from 'react'
import {create, act} from 'react-test-renderer'

const require = createRequire(import.meta.url)
const moduleUrl = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64')
let code = ts.transpileModule(await readFile(new URL('../src/OutingSaveStatus.tsx', import.meta.url), 'utf8'), {
  compilerOptions: {target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX},
}).outputText
for (const [from, to] of Object.entries({
  react: pathToFileURL(require.resolve('react')).href,
  'react/jsx-runtime': pathToFileURL(require.resolve('react/jsx-runtime')).href,
  './store': moduleUrl('export const useStore=()=>globalThis.__outingStatusStore'),
  './ui': moduleUrl(`import React from ${JSON.stringify(pathToFileURL(require.resolve('react')).href)};export const Btn=props=>React.createElement('button',props)`),
})) code = code.replaceAll('from ' + JSON.stringify(from), 'from ' + JSON.stringify(to)).replaceAll("from '" + from + "'", 'from ' + JSON.stringify(to))
const {OutingSaveStatus} = await import(moduleUrl(code))
const buttonText = node => node.children.filter(child => typeof child === 'string').join('')

test('outing retry appears only when it can take meaningful action', async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  let view, retries = 0
  const render = status => {
    globalThis.__outingStatusStore = {account: {uid:'qa'}, outingStatus:status, retrySync:()=>retries++}
    return React.createElement(OutingSaveStatus, {controls:true})
  }
  try {
    for (const status of ['empty','saved','saving','offline','sign-in-required','deleted','pending','save-error','storage-full']) {
      await act(async () => { if (view) view.update(render(status)); else view = create(render(status)) })
      const retry = view.root.findAllByType('button').filter(node => buttonText(node) === 'Retry outing sync')
      assert.equal(retry.length, ['pending','save-error','storage-full'].includes(status) ? 1 : 0, status)
      if (retry.length) await act(async () => retry[0].props.onClick())
    }
    assert.equal(retries, 3)
  } finally {
    await act(async () => view?.unmount())
    delete globalThis.__outingStatusStore
  }
})

test('conflicting outing edits require confirmation and cancellation preserves both versions', async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  let view
  const resolutions = []
  globalThis.__outingStatusStore = {account:{uid:'qa'}, outingStatus:'conflict', resolveOuting:async choice=>resolutions.push(choice)}
  const button = text => view.root.findAllByType('button').find(node => buttonText(node) === text)
  try {
    await act(async () => { view=create(React.createElement(OutingSaveStatus,{controls:true})) })
    await act(async () => button('Use cloud outing').props.onClick())
    assert.deepEqual(resolutions, [])
    await act(async () => button('Cancel').props.onClick())
    assert.equal(view.root.findAllByProps({'aria-label':'Resolve outing conflict'}).length, 0)
    assert.deepEqual(resolutions, [])
    await act(async () => button('Keep my outing edits').props.onClick())
    await act(async () => button('Keep my edits').props.onClick())
    assert.deepEqual(resolutions, ['local'])
  } finally {
    await act(async () => view?.unmount())
    delete globalThis.__outingStatusStore
  }
})
