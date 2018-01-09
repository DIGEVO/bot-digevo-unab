'use strict';

const Intercom = require('intercom-client');
const moment = require('moment');
// const Q = require('q');
const util = require('util');

require('dotenv').config();

const setTimeoutPromise = util.promisify(setTimeout);

const self = module.exports = {
    client: new Intercom.Client({ token: process.env.TOKEN }),

    getConversationLengthAndId: userdata =>
        self.client.conversations
            .list({ type: 'user', user_id: userdata.body.user_id })
            .then(conversationdata => ({
                len: conversationdata.body.conversations.length,
                intercom_user_id: userdata.body.id,
                user_id: userdata.body.user_id,
                conversationId: conversationdata.body.conversations.length ? conversationdata.body.conversations[0].id : undefined
            }))
    ,

    createConversationIfNecessary: ({ len, intercom_user_id, user_id, conversationId }) => {
        if (!len) {
            return self.client.messages
                .create({
                    from: { type: "user", id: intercom_user_id },
                    body: 'Iniciando conversación'
                })
                .then(() => 
                // setTimeoutPromise(
                //     process.env.TIMEOUT,
                    self.client.conversations
                        .list({ type: 'user', user_id: user_id })
                        .then(conversationdata => conversationdata.body.conversations.length ? conversationdata.body.conversations[0].id : undefined)
                 //   )
                // () => Q
                // .delay(process.env.TIMEOUT)
                // .then(() => self.client.conversations
                //     .list({ type: 'user', user_id: user_id })
                //     .then(conversationdata => conversationdata.body.conversations.length ? conversationdata.body.conversations[0].id : undefined))
                );
        } else {
            return Promise.resolve(conversationId);
        }
    },

    replyToConversation: (body, sender_id, conversationId) =>
        self.client.conversations.reply({
            id: conversationId,
            type: 'user',
            message_type: 'comment',
            body: body ? body : 'mensaje vacío',
            user_id: sender_id
        })
    ,

    sendMessageToIntercom({ user_id = 0, name = 'usuario', body = '', sender_id = process.env.BOT }) {
        return self.getLastConversationId({ user_id: user_id, name: name, body: body, sender_id: sender_id })
            .then(self.replyToConversation.bind(null, body, sender_id))
            .catch(e => console.error(e));
    },

    getLastConversationId({ user_id = 0, name = 'usuario', body = '', sender_id = process.env.BOT }) {
        return self.client.users
            .create({ user_id: user_id, name: name })
            .then(self.getConversationLengthAndId)
            .then(self.createConversationIfNecessary)
            .catch(e => console.error(e));
    }
}
