'use strict';

require('dotenv').config();

const dashbot = require('dashbot')(process.env.DASHBOT_API_KEY_GENERIC).generic;

const self = module.exports = {
    dashbotMessage: (text, userId, intent) =>
        Object.assign({ text: text, userId: userId }, intent ? { intent: intent } : {}),

    logMessage: ({ text = '', userId = '', incoming = true, intent = null }) =>
        self.logFuns[incoming](self.dashbotMessage(text, userId, intent))
    ,

    logFuns: {
        true: dashbot.logIncoming,
        false: dashbot.logOutgoing
    }
};
