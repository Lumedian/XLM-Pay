import { AsyncLocalStorage } from 'node:async_hooks';

interface ContextData {
  [key: string]: any;
}

const asyncLocalStorage = new AsyncLocalStorage<ContextData>();

export class RequestContext {
  static run(fn: (...args: any[]) => any, initial: ContextData = {}) {
    return asyncLocalStorage.run(initial, fn);
  }

  static set(key: string, value: any) {
    const store = asyncLocalStorage.getStore();
    if (store) {
      store[key] = value;
    }
  }

  static get<T = any>(key: string): T | undefined {
    const store = asyncLocalStorage.getStore();
    return store ? (store[key] as T) : undefined;
  }
}
