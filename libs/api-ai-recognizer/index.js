"use strict";
const apiai = require('apiai');
const uuid = require('uuid');
const _ = require('lodash');

const utils = require('../middleware-utils');

var ApiAiRecognizer = function (token) {
    this.app = apiai(token);
};

const getKey = ([key, message]) => {
    if (message.platform === 'facebook') return 'feisbu';
    if (message.platform !== 'facebook' && !message.type) return 'nofeisbu';
    return 'others';
}

const processGroup = (group, feisbu) =>
    group.map(([k, message]) => ({
        entity: !feisbu ? message.speech : message,
        type: !feisbu ? 'fulfillment' : message.platform,
        startIndex: -1,
        endIndex: -1,
        score: 1
    }));

ApiAiRecognizer.prototype.recognize = function (context, done) {
    let intent = { score: 0.0 };
    //TODO ver esto.
    // try {
    //     var sessionId = context.message.address.user.id + context.message.address.channelId;
    //     if (sessionId.length > 36) {
    //         //sessionId = sessionId.slice(0, 35);
    //         sess
    //     }
    // } catch (err) {
    //     var sessionId = uuid();
    // }
    

    const userId = context.message.user.id;
    const channelId = context.message.address.channelId;
    const cacheData = utils.cache.get(userId.toString()) || { paused: false };

    const sessionId = userId.slice(0, 35);

    if (context.message.text && !cacheData.paused && (channelId !== 'directline' || userId !== 'IntercomChannel')) {

        console.log(`----> 2: text=${context.message.text} action= id=${sessionId}`);

        const request = this.app.textRequest(context.message.text.toLowerCase().substring(0, 200), { sessionId: sessionId });

        request.on('response', response => {
            utils.saveApiAiResponse(response, context.message.address)
            const result = response.result;
            if (result.source == 'domains') {
                intent = {
                    score: result.score,
                    intent: result.action,
                    entities: [{
                        entity: result.fulfillment.speech,
                        type: 'fulfillment',
                        startIndex: -1,
                        endIndex: -1,
                        score: 1
                    },
                    {
                        entity: result.actionIncomplete,
                        type: 'actionIncomplete',
                        startIndex: -1,
                        endIndex: -1,
                        score: 1
                    }]
                };
            } else if (result.source == 'agent') {
                const groups = _.groupBy(Object.entries(result.fulfillment.messages), getKey);
                const [entities1, entities2] =
                    [groups.nofeisbu || [], groups.feisbu || []].map(processGroup);

                const entities3 = {
                    entity: result.actionIncomplete,
                    type: 'actionIncomplete',
                    startIndex: -1,
                    endIndex: -1,
                    score: 1
                };

                const entities4 = Object.entries(result.parameters)
                    .filter(([key, entity]) => entity.length)
                    .map(([key, entity]) => {
                        const startIndex = context.message.text.indexOf(entity);
                        return {
                            entity: entity,
                            type: key,
                            startIndex: startIndex,
                            endIndex: startIndex + entity.length - 1,
                            score: 1
                        }
                    });

                const entities_found = [].concat(entities1, entities2, entities3, entities4);

                intent = { score: result.score, intent: result.metadata.intentName, entities: entities_found };
            }
            done(null, intent);
        });

        request.on('error', done);
        request.end();
    }
    else {
        done(null, { score: 1, intent: "None", entities: [] });
    }
}

// process.on('unhandledRejection', (reason, p) => {
//     console.log('Unhandled Rejection at: Promise', p, 'reason:', reason);
//     console.log(reason.stack);
//     // application specific logging, throwing an error, or other logic here
//   });

module.exports = ApiAiRecognizer;
