export type * from "./demo-api"

type DemoApi = typeof import("./demo-api").api

let apiPromise: Promise<DemoApi> | undefined

function loadApi() {
  apiPromise ??= import("./demo-api").then((module) => module.api)
  return apiPromise
}

function createLazyApi(path: PropertyKey[]): unknown {
  const invoke = (...args: unknown[]) =>
    loadApi().then((root) => {
      let context: unknown = root

      for (const segment of path.slice(0, -1)) {
        context = Reflect.get(context as object, segment)
      }

      const method = Reflect.get(context as object, path.at(-1) as PropertyKey)
      return Reflect.apply(method, context, args)
    })

  return new Proxy(invoke, {
    get(_target, property) {
      // Prevent Promise resolution from treating the proxy itself as a thenable.
      if (property === "then") return undefined
      return createLazyApi([...path, property])
    },
  })
}

// The demo API and its data store are loaded on the first actual request instead
// of becoming part of every dashboard route's hydration bundle.
export const api = createLazyApi([]) as DemoApi
