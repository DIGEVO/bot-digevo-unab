'use strict';

const MongoClient = require('mongodb').MongoClient;
require('dotenv').config();

exports.processQuery = (queryFn, processDataFn) => {
    const url = process.env.MONGODB_RESPONSES;

    MongoClient.connect(url)
        .then(admin => {
            const db = admin.db('DigebotDB');
            return { result: queryFn(db), dbs: [admin, db] };
        })
        .then(({ result = null, dbs = [] }) => {
            result
                .then(data => processDataFn(data))
                .then(() => dbs.forEach(db => db.close()))
                .catch(e => console.error(e));
        })
        .catch(e => console.error(e));
};
