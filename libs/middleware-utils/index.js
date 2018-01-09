'use strict';

const mongoose = require('mongoose');
const NodeCache = require('node-cache');
const rp = require('request-promise-native');
const uuid = require('uuid');
require('dotenv').config();

const Intercom = require('../intercom');
const Queue = require('../queue');
const dashbot = require('../dashbot');

const Schema = mongoose.Schema;
const ObjectID = mongoose.Types.ObjectId;
const ApiAiResponseSchema = new Schema({ type: Schema.Types.Mixed }, { strict: false });
const InMessageSchema = new Schema({ type: Schema.Types.Mixed }, { strict: false });
const OutMessageSchema = new Schema({ type: Schema.Types.Mixed }, { strict: false });
const ApiAiResponseModel = mongoose.model('apiai_response', ApiAiResponseSchema);
const InMessageModel = mongoose.model('in_message', InMessageSchema);
const OutMessageModel = mongoose.model('out_message', OutMessageSchema);

mongoose.Promise = global.Promise;
mongoose.connect(process.env.MONGO_CONNECTION_STRING);

const self = module.exports = {
    cache: new NodeCache({ stdTTL: process.env.TTL }),

    queue: new Queue(),

    getName: message => message.user.name ? message.user.name : 'usuario'
    ,

    getGreetting: message => {
        const date = new Date(message.timestamp);
        const userLocalTime = new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds());
        const hour = userLocalTime.getHours();
        return hour < 12 ? 'buenos días' : hour >= 19 ? 'buenas noches' : 'buenas tardes';
    },

    saveIncomingMessageIntoCache: (session, next) => {
        const userId = session.message.user.id;
        const cacheData = self.cache.get(userId) || { paused: false };

        self.cache.set(userId, { paused: cacheData.paused });
    },

    //TODO ver esto...
    checkPauseState: (session, next) => {
        const userId = session.message.user.id;
        const cacheData = self.cache.get(userId) || { paused: false };

        const businessOnStack = session.sessionState.callstack
            .map(d => d.id)
            .some(id => id.includes(process.env.BUSINESSDIALOG));

        if (cacheData.paused && businessOnStack) {
            session.endDialog();
        }
    },

    saveIncomingMessageIntoIntercom: (session, next) => {
        const channelId = session.message.address.channelId;
        const userId = session.message.user.id;

        if ((channelId !== 'directline' || userId !== 'IntercomChannel') && session.message.type === 'message' && session.message.text) {
            self.queue.add(() => Intercom.sendMessageToIntercom({
                user_id: userId,
                name: self.getName(session.message),
                body: session.message.text,
                sender_id: userId
            }));
        }
    },

    saveOutgoingMessageIntoIntercom: (event, next) => {
        const channelId = event.address.channelId;
        const userId = event.address.user.id;
        const name = event.address.user.name ? event.address.user.name : 'usuario';
        const text = event.text;
        const mute = event.address.mute;

        if ((channelId !== 'directline' || userId !== 'IntercomChannel') && event.type === 'message' && event.text && !mute) {
            self.queue.add(() => Intercom.sendMessageToIntercom({
                user_id: userId,
                name: name,
                body: text
            }));

            // const cacheData = self.cache.get(userId) || { paused: false };
            // if (!cacheData.paused) {
            //     self.queue.add(() => Intercom.closeConversationAtIntercom({
            //         user_id: userId,
            //         name: name
            //     }));
            // }
        }
    },

    saveIncomingMessageIntoMongoDB: (session, next) => {
        new InMessageModel(
            Object.assign(session.message, { bot_id: new ObjectID(process.env.BOT_ID) })
        ).save();
    },

    saveOutgoingMessageIntoMongoDB: (event, next) => {
        new OutMessageModel(
            Object.assign(event, { bot_id: new ObjectID(process.env.BOT_ID) })
        ).save();
    },

    saveApiAiResponse: (response, address) => {
        try {

            let unsanitizedObj = Object.assign(response, { address: address });
            escapeKeys(unsanitizedObj);
            new ApiAiResponseModel(unsanitizedObj).save()//.then(item => console.log("-----saved to db", /*item*/{}))
                .catch(err => console.log("-----unable to save to database", err));
        } catch (error) {
            console.error(error)
        }
    },

    saveIncomingMessageIntoDashbot: (session, next) => {
        const channelId = session.message.address.channelId;
        const userId = session.message.user.id;
        const cacheData = self.cache.get(userId.toString()) || { paused: false };

        if ((channelId !== 'directline' || userId !== 'IntercomChannel') && session.message.type === 'message' && session.message.text) {

            new Promise((resolve, reject) => {
                resolve(cacheData.paused ?
                    undefined :
                    rp
                        .post({
                            method: 'POST',
                            auth: { 'bearer': process.env.DIALOGFLOW_TOKEN },
                            uri: process.env.URL,
                            body: {
                                query: session.message.text.substring(0, 200),
                                sessionId: (userId + channelId).slice(0, 35),//'dashbot-integration',
                                //sessionId: uuid(),//'dashbot-integration',
                                lang: 'es'
                            },
                            json: true,
                            encoding: 'utf8'
                        })
                        .then(data => {
                            console.log(`----> 1: text=${data.result.resolvedQuery} action=${data.result.action} id=${data.sessionId}`);
                            return data.result.metadata.intentName ? {
                                name: data.result.metadata.intentName,
                                inputs: Object.keys(data.result.parameters)
                                    .map(k => ({ name: k, value: data.result.parameters[k] }))
                                    .filter(kv => kv.value)
                            } : undefined
                        }))
            }).then(intent => dashbot.logMessage({
                text: session.message.text,
                userId: session.message.user.id,
                intent: intent
            })).catch(error => console.error(error));
        }
    },

    saveOutgoingMessageIntoDashbot: (event, next) => {
        const channelId = event.address.channelId;
        const userId = event.address.user.id;
        const name = event.address.user.name ? event.address.user.name : 'usuario';
        const text = event.text;

        if ((channelId !== 'directline' || userId !== 'IntercomChannel') && event.type === 'message') {
            dashbot.logMessage({
                text: text,
                userId: userId,
                incoming: false
            });
        }
    }
};

function escapeKeys(obj) {
    if (!(Boolean(obj) && typeof obj == 'object'
        && Object.keys(obj).length > 0)) {
        return false;
    }
    Object.keys(obj).forEach(function (key) {
        if (typeof (obj[key]) == 'object') {
            escapeKeys(obj[key]);
        } else {
            if (key.indexOf('.') !== -1) {
                var newkey = key.replace(/\./g, '_dot_');
                obj[newkey] = obj[key];
                delete obj[key];
            }
            if (key.indexOf('$') !== -1) {
                var newkey = key.replace(/\$/g, '_amp_');
                obj[newkey] = obj[key];
                delete obj[key];
            }

        }
    });
    return true;
}