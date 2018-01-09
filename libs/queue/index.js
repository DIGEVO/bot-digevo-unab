'use strict';

require('dotenv').config();

class Queue {
    constructor() {
        this.jobs = [];

        setInterval(async () => {
            const task = this.jobs.shift();
            if (task) await task();
        }, process.env.TIMEOUT);
    }

    add(task) {
        this.jobs.push(task);
    }
}

module.exports = Queue;
