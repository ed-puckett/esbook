/** a Promise-like object with its resolve and reject methods exposed externally
 */
export class OpenPromise {
    constructor() {
        let resolve, reject;
        const promise = new Promise((o, x) => { resolve = o; reject = x; });
        Object.defineProperties(this, {
            promise: {
                value: promise,
            },
            resolve: {
                value: resolve,
            },
            reject: {
                value: reject,
            },
            then: {
                value: promise.then.bind(promise),
            },
            catch: {
                value: promise.catch.bind(promise),
            },
            finally: {
                value: promise.finally.bind(promise),
            },
        });
    }

    async await() { return await this.promise; }
}
