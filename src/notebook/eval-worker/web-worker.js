// this is Web Worker code

const AsyncFunction          = Object.getPrototypeOf(async function () {}).constructor;
const AsyncGeneratorFunction = Object.getPrototypeOf(async function* () {}).constructor;

self.onmessage = async function (message) {
    const { request, worker_id, id, expression, objects } = message.data;

    switch (request) {
    case 'eval': {
        try {
            const eval_function = new AsyncFunction('objects', expression);
            const value = await eval_function(objects);
            self.postMessage({ id, value });
        } catch (error) {
            self.postMessage({ id, error });
        }
        break;
    }

    case 'stream_eval': {
        const eval_generator = new AsyncGeneratorFunction('objects', expression);
        try {
            for await (const value of eval_generator(objects)) {
                self.postMessage({ id, value });
            }
        } catch (error) {
            self.postMessage({ id, error });
        }
        self.postMessage({ id, done: true });
        break;
    }

    default: {
        throw new Error(`unknown request ${request}`);
        break;
    }
    }
};
