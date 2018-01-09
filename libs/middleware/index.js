'use strict';

const self = module.exports = {
    inMsgFuns: [],

    outMsgFuns: [],

    initMiddleware: bot => bot.use({
        botbuilder: self.processIncomingMessage,
        send: self.processOutgoingMessage
    }),

    addIncomingMessageHandler: functionHandler =>
        self.inMsgFuns.push(functionHandler)
    ,

    addOutgoingMessageHandler: functionHandler =>
        self.outMsgFuns.push(functionHandler)
    ,

    processIncomingMessage(session, next) {
        self.processMessages(session, next, self.inMsgFuns, 'incoming');
    },

    processOutgoingMessage(event, next) {
        self.processMessages(event, next, self.outMsgFuns, 'outgoing');
    },

    processMessages(param1, param2, arrFuns, msg) {
        let errorMsg = '';

        arrFuns.forEach((fun, i) => {
            try {
                fun(param1, () => { });
            } catch (error) {
                errorMsg.concat(`Error on ${msg} message function ${i}: ${error}\n`);
            }
        });

        if (errorMsg) console.error(errorMsg);

        param2();
    }
};
