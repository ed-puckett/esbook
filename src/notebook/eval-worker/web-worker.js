const AsyncGeneratorFunction = Object.getPrototypeOf(async function* () {}).constructor;

self.onmessage = async function (message) {
    const { id, expression, objects } = message.data;

    const eval_generator = new AsyncGeneratorFunction('objects', expression);
    try {
        for await (const value of eval_generator(objects)) {
            self.postMessage({ id, value });
        }
    } catch (error) {
        self.postMessage({ id, error });
    }
    self.postMessage({ id, done: true });
};
